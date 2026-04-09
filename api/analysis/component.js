import { createPool } from "../lib/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { handleDbError } from "../lib/errors.js";
import { validateId, validateAnalysisWeights } from "../lib/validation.js";
import {
  GEMINI_DEFAULT_MODEL,
  ANALYSIS_MAX_ALTERNATIVES,
} from "../lib/constants.js";

// ---------------------------------------------------------------------------
// Evidence quality
// The 8 compliance criteria we track — same set shown in the UI compliance grid.
// "Verified" means the field is non-null and non-"unknown" in the DB.
// ---------------------------------------------------------------------------
const COMPLIANCE_CRITERIA = [
  "market_ban_eu",
  "market_ban_us",
  "patent_lock",
  "single_manufacturer",
  "vegan_status",
  "halal_status",
  "kosher_status",
  "non_gmo_status",
];

const CRITERIA_LABELS = {
  market_ban_eu:      "EU market status",
  market_ban_us:      "US market status",
  patent_lock:        "Patent lock",
  single_manufacturer:"Single manufacturer",
  vegan_status:       "Vegan status",
  halal_status:       "Halal status",
  kosher_status:      "Kosher status",
  non_gmo_status:     "Non-GMO status",
};

/**
 * Compute evidence quality for one (component, supplier) pair.
 * Returns: verified count, total criteria, missing list, refCount, and a 0–1 score.
 * Refs are supplier-level — more refs = more claims were backed by source URLs.
 */
function computeEvidenceCriteria(component, supplierRefs) {
  const missing = COMPLIANCE_CRITERIA.filter(f => {
    const v = component[f];
    return v == null || v === "unknown";
  });
  const verified = COMPLIANCE_CRITERIA.length - missing.length;
  const fieldScore = verified / COMPLIANCE_CRITERIA.length;
  const refCount = Array.isArray(supplierRefs) ? supplierRefs.length : 0;
  const refBonus = Math.min(refCount * 0.025, 0.12); // each ref adds small confidence, capped at +0.12
  return {
    verified,
    total: COMPLIANCE_CRITERIA.length,
    missing: missing.map(f => CRITERIA_LABELS[f] ?? f),
    refCount,
    score: Math.min(Math.round((fieldScore + refBonus) * 100) / 100, 1.0),
  };
}

// ---------------------------------------------------------------------------
// Scoring dimensions — each maps 1:1 to one of the 5 UI sliders.
// Missing data never scores 0 by itself; it receives a neutral 0.5 baseline
// with an additional penalty proportional to how much the user weights that
// criterion (via the slider). This makes uncertainty transparent and slider-
// responsive: if you crank "Regulatory" to 10, an unknown EU ban hurts more.
// ---------------------------------------------------------------------------

function applyMissingPenalty(base, fieldKey, component, sliderWeight) {
  const v = component[fieldKey];
  if (v != null && v !== "unknown") return base; // data present, no penalty
  const penalty = 0.08 + (sliderWeight / 10) * 0.17; // 0.08–0.25 range
  return Math.max(base - penalty, 0.0);
}

/** Price: relative rank within supplier set. Cheapest = 1.0, priciest = 0.0, unknown = 0.5. */
function dim_price(supplier, allSuppliers) {
  const prices = allSuppliers.map(s => s.price_per_unit).filter(p => p != null);
  if (!prices.length || supplier.price_per_unit == null) return 0.5;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === min) return 0.8; // all same price — fine but not differentiated
  return 1 - (supplier.price_per_unit - min) / (max - min);
}

/**
 * Regulatory: hard 0 for any active ban; 1.0 for both markets permitted.
 * Unknown fields receive neutral 0.5 minus evidence penalty scaled by slider weight.
 */
function dim_regulatory(component, weights) {
  const eu = component.market_ban_eu;
  const us = component.market_ban_us;
  if (eu === "banned" || us === "banned") return 0.0; // hard disqualifier
  const euBase = eu === "permitted" ? 1.0 : 0.5;
  const usBase = us === "permitted" ? 1.0 : 0.5;
  const euScore = applyMissingPenalty(euBase, "market_ban_eu", component, weights.regulatory);
  const usScore = applyMissingPenalty(usBase, "market_ban_us", component, weights.regulatory);
  return (euScore + usScore) / 2;
}

/**
 * Certification fit: supplier's product-level certs matched against what
 * the ingredient requires (from ingredient_profile). No cert data from
 * supplier = 0.5 minus evidence penalty scaled by certFit slider weight.
 */
function dim_certFit(supplier, component, weights) {
  const required = [];
  if (component.vegan_status === "yes")
    required.push({ key: "vegan", profileField: "vegan_status" });
  if (component.halal_status === "yes" || component.halal_status === "compliant")
    required.push({ key: "halal", profileField: "halal_status" });
  if (component.kosher_status === "yes" || component.kosher_status === "compliant")
    required.push({ key: "kosher", profileField: "kosher_status" });
  if (component.non_gmo_status === "yes")
    required.push({ key: "non_gmo", profileField: "non_gmo_status" });
  if (component.organic_status === "yes")
    required.push({ key: "organic", profileField: "organic_status" });

  if (!required.length) {
    // Ingredient has no cert requirements — decent baseline, slight unknown penalty
    return applyMissingPenalty(0.75, "vegan_status", component, weights.certFit);
  }

  const certs = supplier.certifications;
  if (!certs || !Object.keys(certs).length) {
    const penalty = 0.15 + (weights.certFit / 10) * 0.2;
    return Math.max(0.5 - penalty, 0.0);
  }
  const certKeys = Object.keys(certs).map(k => k.toLowerCase().replace(/[-\s]/g, "_"));
  const matched = required.filter(({ key }) => certKeys.some(k => k.includes(key)));
  return matched.length / required.length;
}

/**
 * Supply risk: patent lock is a hard 0; single-manufacturer compounds the risk;
 * geographic diversity and number of available suppliers add resilience.
 * Unknown patent/single-manufacturer fields are penalised by slider weight.
 */
function dim_supplyRisk(supplier, allSuppliers, component, weights) {
  if (component.patent_lock === "yes") return 0.0; // hard disqualifier
  let base = component.patent_lock === "no" ? 0.9
    : applyMissingPenalty(0.65, "patent_lock", component, weights.supplyRisk);

  if (component.single_manufacturer === "yes") {
    base *= 0.35; // severe concentration risk
  } else if (component.single_manufacturer === "no") {
    base = Math.min(base * 1.1, 1.0);
  } else {
    base = applyMissingPenalty(base, "single_manufacturer", component, weights.supplyRisk);
  }

  // Geographic diversity bonus — more unique countries in the supplier set = lower concentration risk
  const uniqueCountries = new Set(allSuppliers.map(s => s.country).filter(Boolean)).size;
  base = Math.min(base + Math.min((uniqueCountries - 1) * 0.05, 0.2), 1.0);

  // Supplier count bonus — more options = more resilience
  base = Math.min(base + Math.min((allSuppliers.length - 1) * 0.03, 0.15), 1.0);

  return base;
}

/** Functional fit: always 1.0 for Tier-1 (same CAS = same molecule = full fit). */
function dim_functionalFit() {
  return 1.0;
}

/**
 * Composite weighted score for one supplier across all 5 dimensions.
 * Returns: score in [0, 1] + per-dimension breakdown for UI transparency.
 */
function computeSupplierScore(supplier, allSuppliers, component, weights) {
  const { price: wP, regulatory: wR, certFit: wC, supplyRisk: wS, functionalFit: wF } = weights;
  const totalW = wP + wR + wC + wS + wF;
  const dims = {
    price:      dim_price(supplier, allSuppliers),
    regulatory: dim_regulatory(component, weights),
    certFit:    dim_certFit(supplier, component, weights),
    supplyRisk: dim_supplyRisk(supplier, allSuppliers, component, weights),
    functional: dim_functionalFit(),
  };
  const raw = (
    wP * dims.price +
    wR * dims.regulatory +
    wC * dims.certFit +
    wS * dims.supplyRisk +
    wF * dims.functional
  ) / totalW;
  return { score: Math.round(raw * 1000) / 1000, dims };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * POST /api/analysis/component
 * Analyzes and ranks suppliers for a component using a data-driven weighted
 * scoring model. Each of the 5 slider weights maps directly to one scoring
 * dimension. Evidence quality per supplier is returned alongside the score.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { componentId: rawComponentId, weights: rawWeights } = req.body || {};

  const { valid: idValid, id: componentId, error: idError } = validateId(rawComponentId);
  if (!idValid) return res.status(400).json({ error: idError || "componentId is required" });

  const { valid: weightsValid, weights, error: weightsError } = validateAnalysisWeights(rawWeights);
  if (!weightsValid) return res.status(400).json({ error: weightsError || "weights object is required" });

  let pool;
  try {
    pool = createPool();

    const componentResult = await pool.query(`
      SELECT
        p.id, p.sku AS name,
        cn.cas_number,
        ip.canonical_name, ip.functional_role,
        ip.market_ban_eu, ip.market_ban_us,
        ip.vegan_status, ip.halal_status, ip.kosher_status,
        ip.non_gmo_status, ip.organic_status,
        ip.patent_lock, ip.single_manufacturer
      FROM product p
      LEFT JOIN component_normalized cn ON cn.raw_product_id = p.id
      LEFT JOIN ingredient_profile ip ON ip.cas_number = cn.cas_number
      WHERE p.id = $1
      LIMIT 1
    `, [componentId]);

    if (!componentResult.rows.length) {
      return res.status(404).json({ error: "Component not found" });
    }
    const component = componentResult.rows[0];

    // Fetch all suppliers — include refs for evidence quality computation
    const suppliersResult = await pool.query(`
      SELECT s.id, s.name, sp.country, sp.region,
             sp.price_per_unit, sp.price_currency, sp.price_unit,
             sp.certifications, sp.refs
      FROM supplier_product sp
      JOIN supplier s ON sp.supplier_id = s.id
      WHERE sp.product_id = $1
    `, [componentId]);
    const suppliers = suppliersResult.rows;

    if (!suppliers.length) {
      return res.status(200).json({
        component: { id: component.id, name: component.name },
        recommendedSupplier: { name: "No suppliers available", score: 0, reasoning: "No suppliers found.", reasoningDetails: null },
        alternatives: [],
        metrics: weights,
        supplierCount: 0,
      });
    }

    // Score and rank all suppliers
    const scored = suppliers
      .map(s => {
        const { score, dims } = computeSupplierScore(s, suppliers, component, weights);
        const evidence = computeEvidenceCriteria(component, s.refs);
        return { ...s, score, dims, evidence };
      })
      .sort((a, b) => b.score - a.score);

    const recommendedSupplier = scored[0];
    const alternatives = scored.slice(1, ANALYSIS_MAX_ALTERNATIVES + 1);

    // Gemini reasoning (optional enrichment — explains the top pick in plain language)
    let reasoning = "";
    let reasoningDetails = {
      summary: `${recommendedSupplier.name} scores highest for ${component.canonical_name ?? component.name} given your priorities.`,
      price_analysis: recommendedSupplier.price_per_unit
        ? `Listed at ${recommendedSupplier.price_currency ?? "$"}${recommendedSupplier.price_per_unit}/${recommendedSupplier.price_unit ?? "unit"}.`
        : "Pricing information not available — contact supplier for a quote.",
      compliance: buildComplianceNote(component),
      supply_chain: buildSupplyChainNote(component, suppliers.length),
      certifications: buildCertNote(recommendedSupplier.certifications),
    };

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({
          model: GEMINI_DEFAULT_MODEL,
          generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
        });

        const supplierDetails = scored.slice(0, 5).map(s => {
          const p = s.price_per_unit ? `${s.price_currency ?? "$"}${s.price_per_unit}/${s.price_unit ?? "unit"}` : "price unknown";
          const c = s.certifications ? Object.entries(s.certifications).map(([k, v]) => `${k}:${v}`).join(", ") : "none";
          return `- ${s.name} (${s.country ?? "unknown"}): ${p}, certs: ${c}, score: ${(s.score * 100).toFixed(0)}%`;
        }).join("\n");

        const prompt = `You are a supply chain advisor. Explain in 3–4 sentences why ${recommendedSupplier.name} is the top-ranked supplier for ${component.canonical_name ?? component.name}.

Ingredient: ${component.canonical_name ?? component.name} | CAS: ${component.cas_number ?? "unknown"} | Role: ${component.functional_role ?? "unknown"}
EU ban: ${component.market_ban_eu ?? "unknown"} | US ban: ${component.market_ban_us ?? "unknown"} | Patent lock: ${component.patent_lock ?? "unknown"}
Vegan: ${component.vegan_status ?? "unknown"} | Halal: ${component.halal_status ?? "unknown"}

User priorities (1–10): Price=${weights.price} Regulatory=${weights.regulatory} CertFit=${weights.certFit} SupplyRisk=${weights.supplyRisk} FunctionalFit=${weights.functionalFit}

Ranked suppliers:
${supplierDetails}

Focus on why the #1 pick wins on the user's top priorities. Cite specific data points (price, certs, geography). Be concise.`;

        const result = await model.generateContent(prompt);
        reasoning = result.response.text().trim();
      } catch (err) {
        console.error("Gemini reasoning error:", err);
      }
    }

    if (!reasoning) {
      reasoning = buildFallbackReasoning(recommendedSupplier, component, weights, suppliers.length);
    }

    return res.status(200).json({
      component: { id: component.id, name: component.name },
      recommendedSupplier: {
        name: recommendedSupplier.name,
        score: recommendedSupplier.score,
        reasoning,
        reasoningDetails,
        country: recommendedSupplier.country,
        price: recommendedSupplier.price_per_unit,
        priceCurrency: recommendedSupplier.price_currency,
        priceUnit: recommendedSupplier.price_unit,
        certifications: recommendedSupplier.certifications,
        refs: recommendedSupplier.refs,
        scoreDims: recommendedSupplier.dims,
        evidenceCriteria: recommendedSupplier.evidence,
      },
      alternatives: alternatives.map(s => ({
        name: s.name,
        score: s.score,
        reasoning: buildAlternativeNote(s, recommendedSupplier),
        country: s.country,
        price: s.price_per_unit,
        scoreDims: s.dims,
        evidenceCriteria: s.evidence,
      })),
      metrics: weights,
      supplierCount: suppliers.length,
    });
  } catch (error) {
    return handleDbError(res, error, "Analysis API");
  } finally {
    if (pool) await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Reasoning helpers
// ---------------------------------------------------------------------------

function buildComplianceNote(c) {
  const ok = [];
  if (c.market_ban_eu === "permitted") ok.push("EU approved");
  if (c.market_ban_us === "permitted") ok.push("US approved");
  if (c.vegan_status === "yes") ok.push("vegan");
  if (c.halal_status === "compliant" || c.halal_status === "yes") ok.push("halal");
  return ok.length ? `Compliance: ${ok.join(", ")}.` : "Compliance data partially unverified — check supplier documentation.";
}

function buildSupplyChainNote(c, n) {
  const notes = [];
  if (c.patent_lock === "yes") notes.push("patent-restricted compound");
  if (c.single_manufacturer === "yes") notes.push("single-manufacturer — high concentration risk");
  if (n > 2) notes.push(`${n} suppliers available for multi-source strategy`);
  return notes.length ? notes.join("; ") + "." : "Standard supply chain profile.";
}

function buildCertNote(certs) {
  if (!certs || !Object.keys(certs).length) return "Certifications: request documentation from supplier.";
  return `Certifications: ${Object.entries(certs).map(([k, v]) => `${k}: ${v}`).join(", ")}.`;
}

function buildAlternativeNote(s, top) {
  const parts = [];
  if (s.country && s.country !== top.country) parts.push(`${s.country} — geographic diversification`);
  if (s.price_per_unit != null && top.price_per_unit != null) {
    parts.push(s.price_per_unit < top.price_per_unit ? "lower price" : "premium pricing");
  }
  const gap = ((top.score - s.score) * 100).toFixed(0);
  parts.push(`${gap}pt below top pick`);
  return parts.join(" · ") + ".";
}

function buildFallbackReasoning(s, component, weights, n) {
  const parts = [`${s.name} leads on the current priority weighting`];
  if (s.price_per_unit) parts.push(`priced at ${s.price_currency ?? "$"}${s.price_per_unit}/${s.price_unit ?? "unit"}`);
  if (s.country) parts.push(`based in ${s.country}`);
  if (n > 1) parts.push(`${n} total suppliers provide multi-source flexibility`);
  return parts.join(", ") + ".";
}

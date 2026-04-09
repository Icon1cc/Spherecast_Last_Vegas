import { createPool } from "../lib/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { handleDbError } from "../lib/errors.js";
import { validateId } from "../lib/validation.js";
import { GEMINI_DEFAULT_MODEL } from "../lib/constants.js";

/**
 * GET /api/substitution/[componentId]
 * Returns tiered substitution candidates for a raw material component.
 *
 * Tier 1 — Same molecule (CAS), different supplier
 * Tier 2 — Same functional role + compliance-compatible, different CAS
 * Tier 3 — Gemini AI reasoning with structured trace
 *
 * Query params:
 *   ?weights=price:7,regulatory:8,certFit:6,supplyRisk:5,functionalFit:9
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { componentId: rawId } = req.query;
  const { valid, id: componentId, error: idError } = validateId(rawId);
  if (!valid) {
    return res.status(400).json({ error: idError || "componentId is required" });
  }

  // Parse optional weights from query string: ?weights=price:7,regulatory:8,...
  const weightsRaw = req.query.weights || "";
  const weights = { price: 5, regulatory: 5, certFit: 5, supplyRisk: 5, functionalFit: 5 };
  for (const part of weightsRaw.split(",")) {
    const [k, v] = part.split(":");
    if (k && v && weights[k] !== undefined) weights[k] = Math.max(1, Math.min(10, Number(v) || 5));
  }

  let pool;
  try {
    pool = createPool();

    // --- Fetch component base data + enrichment profile ---
    const baseQuery = `
      SELECT
        p.id, p.sku AS name,
        cn.cas_number, cn.ingredient_slug,
        ip.canonical_name, ip.functional_role,
        ip.market_ban_eu, ip.market_ban_us,
        ip.vegan_status, ip.vegetarian_status,
        ip.halal_status, ip.kosher_status,
        ip.non_gmo_status, ip.organic_status,
        ip.patent_lock, ip.single_manufacturer,
        ip.allergen_flags, ip.label_form_claim, ip.health_claim_form,
        sp.supplier_id AS current_supplier_id,
        s.name AS current_supplier_name,
        sp.country AS current_country,
        sp.price_per_unit AS current_price
      FROM product p
      LEFT JOIN component_normalized cn ON cn.raw_product_id = p.id
      LEFT JOIN ingredient_profile ip ON ip.cas_number = cn.cas_number
      LEFT JOIN supplier_product sp ON sp.product_id = p.id
      LEFT JOIN supplier s ON s.id = sp.supplier_id
      WHERE p.id = $1
      LIMIT 1
    `;
    const baseResult = await pool.query(baseQuery, [componentId]);

    if (baseResult.rows.length === 0) {
      return res.status(404).json({ error: "Component not found" });
    }

    const base = baseResult.rows[0];

    // --- Tier 1: same CAS, different suppliers ---
    let tier1 = [];
    if (base.cas_number) {
      const t1Query = `
        SELECT DISTINCT
          s.id AS supplier_id,
          s.name AS supplier_name,
          sp.country,
          sp.region,
          sp.price_per_unit,
          sp.price_unit,
          sp.price_moq,
          sp.price_currency,
          sp.certifications,
          sp.sup_url,
          sp.product_page_url,
          sp.spec_sheet_url,
          sp.refs
        FROM component_normalized cn
        JOIN supplier_product sp ON sp.product_id = cn.raw_product_id
        JOIN supplier s ON s.id = sp.supplier_id
        WHERE cn.cas_number = $1
          AND s.id != $2
        ORDER BY sp.price_per_unit ASC NULLS LAST, s.name
        LIMIT 10
      `;
      const t1Result = await pool.query(t1Query, [base.cas_number, base.current_supplier_id ?? 0]);
      tier1 = t1Result.rows;
    }

    // --- Tier 2: same functional_role, compliance-compatible, different CAS ---
    let tier2 = [];
    if (base.functional_role && base.cas_number) {
      const t2Query = `
        SELECT DISTINCT
          ip.cas_number,
          ip.canonical_name,
          ip.vegan_status,
          ip.halal_status,
          ip.market_ban_eu,
          ip.market_ban_us,
          ip.patent_lock,
          s.id AS supplier_id,
          s.name AS supplier_name,
          sp.country,
          sp.price_per_unit,
          sp.certifications
        FROM ingredient_profile ip
        JOIN component_normalized cn ON cn.cas_number = ip.cas_number
        JOIN supplier_product sp ON sp.product_id = cn.raw_product_id
        JOIN supplier s ON s.id = sp.supplier_id
        WHERE ip.functional_role = $1
          AND ip.cas_number != $2
          AND ip.patent_lock != 'yes'
          AND (ip.market_ban_eu = $3 OR ip.market_ban_eu IS NULL OR $3 IS NULL)
          AND (
            $4 IS NULL OR $4 = 'unknown'
            OR ip.vegan_status = $4
            OR ip.vegan_status = 'unknown'
          )
        ORDER BY sp.price_per_unit ASC NULLS LAST, ip.canonical_name
        LIMIT 8
      `;
      const t2Result = await pool.query(t2Query, [
        base.functional_role,
        base.cas_number,
        base.market_ban_eu ?? null,
        base.vegan_status ?? null,
      ]);
      tier2 = t2Result.rows;
    }

    // --- Tier 3: Gemini AI reasoning trace ---
    let aiRecommendation = null;
    const geminiKey = process.env.GEMINI_API_KEY?.trim();

    if (geminiKey) {
      const t1Summary = tier1.length > 0
        ? tier1.slice(0, 3).map(r => `- ${r.supplier_name} (${r.country ?? "unknown"})${r.price_per_unit ? ` $${r.price_per_unit}/unit` : ""}`).join("\n")
        : "None found in database";

      const t2Summary = tier2.length > 0
        ? tier2.slice(0, 3).map(r => `- ${r.canonical_name} from ${r.supplier_name} (${r.country ?? "unknown"}), vegan=${r.vegan_status}, EU=${r.market_ban_eu}`).join("\n")
        : "None found in database";

      const prompt = `You are a supply chain advisor for dietary supplement manufacturing.

COMPONENT: ${base.canonical_name ?? base.name} (CAS: ${base.cas_number ?? "unknown"})
FUNCTIONAL ROLE: ${base.functional_role ?? "unknown"}
CURRENT SUPPLIER: ${base.current_supplier_name ?? "unknown"} (${base.current_country ?? "unknown"})
COMPLIANCE PROFILE:
  vegan=${base.vegan_status ?? "unknown"}, halal=${base.halal_status ?? "unknown"}
  EU market=${base.market_ban_eu ?? "unknown"}, US market=${base.market_ban_us ?? "unknown"}
  patent_lock=${base.patent_lock ?? "unknown"}, single_manufacturer=${base.single_manufacturer ?? "unknown"}
USER PRIORITIES (1-10): price=${weights.price}, regulatory_compliance=${weights.regulatory}, certification_fit=${weights.certFit}, supply_risk=${weights.supplyRisk}, functional_fit=${weights.functionalFit}

TIER 1 ALTERNATIVES (same molecule, different supplier):
${t1Summary}

TIER 2 ALTERNATIVES (same function, different molecule):
${t2Summary}

Based on the data above, recommend the single best substitution option.
Respond ONLY with valid JSON in this exact format (no markdown, no explanation outside JSON):
{
  "recommendation": "supplier or ingredient name",
  "tier": 1,
  "confidence": 0.85,
  "reasoning": {
    "functional_equivalence": "one sentence explaining functional match",
    "compliance_fit": "one sentence on regulatory and cert status",
    "supply_risk": "one sentence on geographic/patent/single-source risk",
    "cost_impact": "one sentence on price impact or null if unknown"
  }
}`;

      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({
          model: GEMINI_DEFAULT_MODEL,
          generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        // Strip markdown fences if present
        const jsonText = text.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
        aiRecommendation = JSON.parse(jsonText);
      } catch (aiErr) {
        // Fallback: best-effort from available tiers
        const best = tier1[0] ?? tier2[0];
        aiRecommendation = best
          ? {
              recommendation: tier1[0] ? tier1[0].supplier_name : tier2[0].canonical_name,
              tier: tier1[0] ? 1 : 2,
              confidence: 0.6,
              reasoning: {
                functional_equivalence: "Same functional role confirmed in ingredient database.",
                compliance_fit: `Regulatory status: EU=${base.market_ban_eu}, vegan=${base.vegan_status}.`,
                supply_risk: base.single_manufacturer === "yes" ? "Single-manufacturer ingredient — limited alternatives." : "Multiple suppliers available.",
                cost_impact: null,
              },
            }
          : null;
      }
    }

    return res.status(200).json({
      component: {
        id: base.id,
        name: base.name,
        cas_number: base.cas_number,
        canonical_name: base.canonical_name,
        functional_role: base.functional_role,
      },
      complianceProfile: {
        vegan_status: base.vegan_status,
        vegetarian_status: base.vegetarian_status,
        halal_status: base.halal_status,
        kosher_status: base.kosher_status,
        non_gmo_status: base.non_gmo_status,
        organic_status: base.organic_status,
        market_ban_eu: base.market_ban_eu,
        market_ban_us: base.market_ban_us,
        patent_lock: base.patent_lock,
        single_manufacturer: base.single_manufacturer,
        allergen_flags: base.allergen_flags ?? [],
        label_form_claim: base.label_form_claim,
        health_claim_form: base.health_claim_form,
      },
      tier1,
      tier2,
      aiRecommendation,
      weights,
    });
  } catch (error) {
    return handleDbError(res, error, "Substitution API");
  } finally {
    if (pool) await pool.end();
  }
}

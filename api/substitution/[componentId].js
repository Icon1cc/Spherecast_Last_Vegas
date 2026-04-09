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
export async function substitutionHandler(req, res) {
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
        LIMIT 20
      `;
      const t1Result = await pool.query(t1Query, [base.cas_number, base.current_supplier_id ?? 0]);

      // Score and sort Tier 1 based on weights
      tier1 = scoreTier1Candidates(t1Result.rows, base, weights);
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
          ip.kosher_status,
          ip.non_gmo_status,
          ip.organic_status,
          ip.market_ban_eu,
          ip.market_ban_us,
          ip.patent_lock,
          ip.single_manufacturer,
          s.id AS supplier_id,
          s.name AS supplier_name,
          sp.country,
          sp.region,
          sp.price_per_unit,
          sp.certifications
        FROM ingredient_profile ip
        JOIN component_normalized cn ON cn.cas_number = ip.cas_number
        JOIN supplier_product sp ON sp.product_id = cn.raw_product_id
        JOIN supplier s ON s.id = sp.supplier_id
        WHERE ip.functional_role = $1
          AND ip.cas_number != $2
          AND ip.patent_lock != 'yes'
        LIMIT 20
      `;
      const t2Result = await pool.query(t2Query, [
        base.functional_role,
        base.cas_number,
      ]);

      // Score and sort Tier 2 based on weights
      tier2 = scoreTier2Candidates(t2Result.rows, base, weights);
    }

    // --- Tier 3: Gemini AI reasoning trace ---
    let aiRecommendation = null;
    const geminiKey = process.env.GEMINI_API_KEY?.trim();

    // Collect all refs from tier1 for sources
    const allRefs = tier1.flatMap(r => r.refs ?? []).filter(ref => ref && ref.url);

    if (geminiKey && (tier1.length > 0 || tier2.length > 0)) {
      const t1Summary = tier1.length > 0
        ? tier1.slice(0, 5).map(r => {
            const price = r.price_per_unit ? `$${r.price_per_unit}/${r.price_unit || 'unit'}` : "price unknown";
            const certs = r.certifications ? Object.entries(r.certifications).map(([k,v]) => `${k}:${v}`).join(", ") : "no certs";
            return `- ${r.supplier_name} (${r.country ?? "unknown"}): ${price}, certifications: ${certs}, SCORE: ${Math.round(r.score * 100)}%`;
          }).join("\n")
        : "None found in database";

      const t2Summary = tier2.length > 0
        ? tier2.slice(0, 5).map(r => {
            const price = r.price_per_unit ? `$${r.price_per_unit}/unit` : "price unknown";
            return `- ${r.canonical_name} (CAS: ${r.cas_number}) from ${r.supplier_name} (${r.country ?? "unknown"}): ${price}, vegan=${r.vegan_status}, EU=${r.market_ban_eu}, SCORE: ${Math.round(r.score * 100)}%`;
          }).join("\n")
        : "None found in database";

      const prompt = `You are a senior supply chain advisor for dietary supplement and CPG manufacturing. Provide detailed, actionable recommendations.

COMPONENT ANALYSIS REQUEST:
- Component: ${base.canonical_name ?? base.name}
- CAS Number: ${base.cas_number ?? "unknown"}
- Functional Role: ${base.functional_role ?? "unknown"}
- Current Supplier: ${base.current_supplier_name ?? "unknown"} (${base.current_country ?? "unknown"})
- Current Price: ${base.current_price ? `$${base.current_price}/unit` : "unknown"}

COMPLIANCE PROFILE:
- Vegan: ${base.vegan_status ?? "unknown"}
- Halal: ${base.halal_status ?? "unknown"}
- Kosher: ${base.kosher_status ?? "unknown"}
- EU Market Status: ${base.market_ban_eu ?? "unknown"}
- US Market Status: ${base.market_ban_us ?? "unknown"}
- Patent Lock: ${base.patent_lock ?? "unknown"}
- Single Manufacturer: ${base.single_manufacturer ?? "unknown"}

USER PRIORITIES (1-10 scale, higher = more important):
- Price/Cost: ${weights.price}
- Regulatory Compliance: ${weights.regulatory}
- Certification Fit: ${weights.certFit}
- Supply Risk Mitigation: ${weights.supplyRisk}
- Functional Fit: ${weights.functionalFit}

TIER 1 ALTERNATIVES (same molecule/CAS, different supplier - drop-in replacement):
${t1Summary}

TIER 2 ALTERNATIVES (same function, different molecule - requires reformulation):
${t2Summary}

The candidates above have been PRE-SCORED based on user priorities. The SCORE indicates overall fit.
Recommend the HIGHEST SCORING option that best matches user priorities.

IMPORTANT: Provide detailed reasoning (2-3 sentences each) that explains WHY this is the best choice, citing specific data points.

Respond ONLY with valid JSON (no markdown fences):
{
  "recommendation": "exact supplier or ingredient name from the lists above",
  "tier": 1,
  "confidence": 0.85,
  "reasoning": {
    "functional_equivalence": "2-3 sentences explaining functional match and why this is a suitable replacement",
    "compliance_fit": "2-3 sentences on regulatory status, certifications, and market access",
    "supply_risk": "2-3 sentences on geographic diversification, patent status, and supply chain resilience",
    "cost_impact": "2-3 sentences on price comparison, MOQ, and total cost of ownership"
  }
}`;

      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({
          model: GEMINI_DEFAULT_MODEL,
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        // Strip markdown fences if present
        const jsonText = text.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
        aiRecommendation = JSON.parse(jsonText);

        // Attach relevant sources to the AI recommendation
        if (aiRecommendation) {
          // Find refs from the recommended supplier if tier 1
          const recommendedSupplier = tier1.find(r =>
            r.supplier_name.toLowerCase() === aiRecommendation.recommendation.toLowerCase()
          );
          const supplierRefs = recommendedSupplier?.refs ?? [];

          // Combine with general refs, deduplicate by URL
          const seenUrls = new Set();
          const combinedRefs = [...supplierRefs, ...allRefs.slice(0, 5)].filter(ref => {
            if (seenUrls.has(ref.url)) return false;
            seenUrls.add(ref.url);
            return true;
          }).slice(0, 8);

          aiRecommendation.sources = combinedRefs;
        }
      } catch (aiErr) {
        // Fall through to deterministic fallback below.
        console.error("AI recommendation error:", aiErr);
      }
    }

    // Deterministic fallback when Gemini is unavailable or fails.
    if (!aiRecommendation) {
      const best = tier1[0] ?? tier2[0];
      const bestRefs = tier1[0]?.refs ?? [];
      aiRecommendation = best
        ? {
            recommendation: tier1[0] ? tier1[0].supplier_name : tier2[0].canonical_name,
            tier: tier1[0] ? 1 : 2,
            confidence: best.score ?? 0.6,
            reasoning: {
              functional_equivalence: `This ${tier1[0] ? "supplier offers the identical molecule (same CAS number)" : "ingredient serves the same functional role"} as your current ingredient, ensuring compatibility with your existing formulation. ${base.functional_role ? `Both serve as ${base.functional_role} in the product.` : ""} No reformulation or stability testing should be required for this substitution.`,
              compliance_fit: `Regulatory status shows EU market: ${base.market_ban_eu ?? "unknown"}, US market: ${base.market_ban_us ?? "unknown"}. Certification profile: vegan=${base.vegan_status ?? "unknown"}, halal=${base.halal_status ?? "unknown"}, kosher=${base.kosher_status ?? "unknown"}. This matches your current ingredient's compliance requirements.`,
              supply_risk: base.single_manufacturer === "yes"
                ? "This is a single-manufacturer ingredient, which presents supply chain concentration risk. Consider qualifying multiple suppliers for business continuity. Geographic diversification may be limited."
                : `Multiple suppliers are available for this ingredient, providing supply chain resilience. ${tier1.length > 1 ? `We identified ${tier1.length} alternative suppliers across different regions.` : ""} This reduces single-source dependency risk.`,
              cost_impact: best.price_per_unit != null
                ? `Listed at $${best.price_per_unit}/${best.price_unit || 'unit'}. ${base.current_price ? `Compared to current price of $${base.current_price}/unit, this represents a ${best.price_per_unit < base.current_price ? 'cost savings' : 'price increase'}.` : "Compare with your current supplier pricing for accurate cost analysis."} ${best.price_moq ? `MOQ: ${best.price_moq}.` : ""}`
                : "Price information not available in our database. Contact the supplier directly for current pricing and volume discounts.",
            },
            sources: bestRefs.slice(0, 5),
          }
        : null;
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
      tier1: tier1.slice(0, 10),
      tier2: tier2.slice(0, 8),
      aiRecommendation,
      weights,
    });
  } catch (error) {
    return handleDbError(res, error, "Substitution API");
  } finally {
    if (pool) await pool.end();
  }
}

/**
 * Score Tier 1 candidates based on user weights
 * Tier 1 = same molecule, so functionalFit is always 100%
 */
function scoreTier1Candidates(candidates, base, weights) {
  const totalWeight = weights.price + weights.regulatory + weights.certFit + weights.supplyRisk + weights.functionalFit;

  // Find min/max prices for normalization
  const prices = candidates.filter(c => c.price_per_unit != null).map(c => c.price_per_unit);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 1;
  const priceRange = maxPrice - minPrice || 1;

  const scored = candidates.map(candidate => {
    let score = 0;

    // Price score (lower is better) - normalized 0-1
    if (candidate.price_per_unit != null) {
      const priceScore = 1 - ((candidate.price_per_unit - minPrice) / priceRange);
      score += priceScore * (weights.price / totalWeight);
    } else {
      // No price info = neutral score
      score += 0.5 * (weights.price / totalWeight);
    }

    // Regulatory score - based on country/region diversity
    const regulatoryScore = calculateRegulatoryScore(candidate, base);
    score += regulatoryScore * (weights.regulatory / totalWeight);

    // Certification fit score
    const certScore = calculateCertificationScore(candidate.certifications, base);
    score += certScore * (weights.certFit / totalWeight);

    // Supply risk score (geographic diversification)
    const supplyRiskScore = calculateSupplyRiskScore(candidate, base);
    score += supplyRiskScore * (weights.supplyRisk / totalWeight);

    // Functional fit = 100% for Tier 1 (same CAS)
    score += 1.0 * (weights.functionalFit / totalWeight);

    return {
      ...candidate,
      score: Math.min(0.99, Math.max(0.1, score)),
    };
  });

  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Score Tier 2 candidates based on user weights
 * Tier 2 = different molecule, same function
 */
function scoreTier2Candidates(candidates, base, weights) {
  const totalWeight = weights.price + weights.regulatory + weights.certFit + weights.supplyRisk + weights.functionalFit;

  // Find min/max prices for normalization
  const prices = candidates.filter(c => c.price_per_unit != null).map(c => c.price_per_unit);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 1;
  const priceRange = maxPrice - minPrice || 1;

  const scored = candidates.map(candidate => {
    let score = 0;

    // Price score (lower is better)
    if (candidate.price_per_unit != null) {
      const priceScore = 1 - ((candidate.price_per_unit - minPrice) / priceRange);
      score += priceScore * (weights.price / totalWeight);
    } else {
      score += 0.5 * (weights.price / totalWeight);
    }

    // Regulatory score - check market bans match
    let regulatoryScore = 0.5;
    if (candidate.market_ban_eu === base.market_ban_eu || candidate.market_ban_eu === 'permitted') {
      regulatoryScore += 0.25;
    }
    if (candidate.market_ban_us === base.market_ban_us || candidate.market_ban_us === 'permitted') {
      regulatoryScore += 0.25;
    }
    score += regulatoryScore * (weights.regulatory / totalWeight);

    // Certification fit score - check vegan/halal/kosher match
    let certScore = 0;
    const certChecks = [
      { candidate: candidate.vegan_status, base: base.vegan_status },
      { candidate: candidate.halal_status, base: base.halal_status },
      { candidate: candidate.kosher_status, base: base.kosher_status },
      { candidate: candidate.non_gmo_status, base: base.non_gmo_status },
      { candidate: candidate.organic_status, base: base.organic_status },
    ];
    let matchCount = 0;
    for (const check of certChecks) {
      if (check.candidate === check.base ||
          check.candidate === 'yes' || check.candidate === 'compliant' || check.candidate === 'certified' ||
          check.base === 'unknown' || check.candidate === 'unknown') {
        matchCount++;
      }
    }
    certScore = matchCount / certChecks.length;
    score += certScore * (weights.certFit / totalWeight);

    // Supply risk score
    let supplyRiskScore = 0.5;
    if (candidate.patent_lock === 'no') supplyRiskScore += 0.2;
    if (candidate.single_manufacturer === 'no') supplyRiskScore += 0.2;
    if (candidate.country && candidate.country !== base.current_country) supplyRiskScore += 0.1;
    score += Math.min(1, supplyRiskScore) * (weights.supplyRisk / totalWeight);

    // Functional fit - same role but different molecule = 80% base
    score += 0.8 * (weights.functionalFit / totalWeight);

    return {
      ...candidate,
      score: Math.min(0.95, Math.max(0.1, score)), // Cap at 95% for tier 2
    };
  });

  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Calculate regulatory score for a supplier
 */
function calculateRegulatoryScore(candidate, base) {
  let score = 0.5; // Base score

  // Geographic diversity bonus
  if (candidate.country) {
    if (candidate.country !== base.current_country) {
      score += 0.2; // Different country = diversification
    }
    // Premium regions
    if (['US', 'DE', 'CH', 'JP', 'GB'].includes(candidate.country)) {
      score += 0.15;
    } else if (['CN', 'IN'].includes(candidate.country)) {
      score += 0.05; // Common but higher risk
    } else {
      score += 0.1;
    }
  }

  return Math.min(1, score);
}

/**
 * Calculate certification score
 */
function calculateCertificationScore(certifications, base) {
  if (!certifications || Object.keys(certifications).length === 0) {
    return 0.3; // No certs = low score
  }

  let score = 0.5;
  const certs = Object.keys(certifications).map(k => k.toLowerCase());

  // Check for relevant certifications
  if (certs.some(c => c.includes('iso'))) score += 0.15;
  if (certs.some(c => c.includes('gmp') || c.includes('cgmp'))) score += 0.15;
  if (certs.some(c => c.includes('halal'))) score += 0.1;
  if (certs.some(c => c.includes('kosher'))) score += 0.1;
  if (certs.some(c => c.includes('organic'))) score += 0.1;
  if (certs.some(c => c.includes('vegan'))) score += 0.1;

  return Math.min(1, score);
}

/**
 * Calculate supply risk score
 */
function calculateSupplyRiskScore(candidate, base) {
  let score = 0.5;

  // Geographic diversification
  if (candidate.country && candidate.country !== base.current_country) {
    score += 0.2;
  }

  // Region diversification
  if (candidate.region && candidate.region !== 'unknown') {
    score += 0.1;
  }

  // Multiple regions available is better
  if (candidate.region === 'europe' || candidate.region === 'north_america') {
    score += 0.1; // Stable supply regions
  }

  return Math.min(1, score);
}

export default substitutionHandler;

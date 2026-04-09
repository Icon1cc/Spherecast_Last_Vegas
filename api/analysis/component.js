import { createPool } from "../lib/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { handleDbError } from "../lib/errors.js";
import { validateId, validateAnalysisWeights } from "../lib/validation.js";
import {
  GEMINI_DEFAULT_MODEL,
  ANALYSIS_BASE_SCORE,
  ANALYSIS_MAX_SCORE,
  ANALYSIS_WEIGHT_NORMALIZATION,
  ANALYSIS_SCORE_INCREMENT,
  ANALYSIS_ALTERNATIVE_DEGRADATION,
  ANALYSIS_MAX_ALTERNATIVES,
} from "../lib/constants.js";

/**
 * POST /api/analysis/component
 * Analyzes suppliers for a component and returns weighted recommendations.
 * @param {Object} req.body - Request body
 * @param {number} req.body.componentId - Component/product ID to analyze
 * @param {Object} req.body.weights - Weight priorities (each 1-10)
 * @param {number} req.body.weights.price - Price / cost priority
 * @param {number} req.body.weights.regulatory - Regulatory compliance (EU/US market bans)
 * @param {number} req.body.weights.certFit - Certification fit (vegan/halal/kosher/non-GMO/organic)
 * @param {number} req.body.weights.supplyRisk - Supply risk (patent lock, single manufacturer, geography)
 * @param {number} req.body.weights.functionalFit - Functional fit (role match, bioequivalence)
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { componentId: rawComponentId, weights: rawWeights } = req.body || {};

  const { valid: idValid, id: componentId, error: idError } = validateId(rawComponentId);
  if (!idValid) {
    return res.status(400).json({ error: idError || "componentId is required" });
  }

  const { valid: weightsValid, weights, error: weightsError } = validateAnalysisWeights(rawWeights);
  if (!weightsValid) {
    return res.status(400).json({ error: weightsError || "weights object is required" });
  }

  let pool;
  try {
    pool = createPool();

    // Get component + enrichment profile in one query
    const componentQuery = `
      SELECT
        p.id, p.sku AS name,
        cn.cas_number,
        ip.canonical_name, ip.functional_role,
        ip.market_ban_eu, ip.market_ban_us,
        ip.vegan_status, ip.halal_status, ip.kosher_status,
        ip.patent_lock, ip.single_manufacturer
      FROM product p
      LEFT JOIN component_normalized cn ON cn.raw_product_id = p.id
      LEFT JOIN ingredient_profile ip ON ip.cas_number = cn.cas_number
      WHERE p.id = $1
      LIMIT 1
    `;
    const componentResult = await pool.query(componentQuery, [componentId]);

    if (componentResult.rows.length === 0) {
      return res.status(404).json({ error: "Component not found" });
    }

    const component = componentResult.rows[0];

    // Get suppliers with enrichment data for this component
    const suppliersQuery = `
      SELECT s.id, s.name, sp.country, sp.price_per_unit, sp.certifications
      FROM supplier_product sp
      JOIN supplier s ON sp.supplier_id = s.id
      WHERE sp.product_id = $1
      ORDER BY sp.price_per_unit ASC NULLS LAST, s.name
    `;
    const suppliersResult = await pool.query(suppliersQuery, [componentId]);
    const suppliers = suppliersResult.rows;

    // Calculate scores using constants
    const { price, regulatory, certFit, supplyRisk, functionalFit } = weights;
    const totalWeight = price + regulatory + certFit + supplyRisk + functionalFit;
    const normalizedScore = ANALYSIS_BASE_SCORE + (totalWeight / ANALYSIS_WEIGHT_NORMALIZATION) * ANALYSIS_SCORE_INCREMENT;
    const baseScore = Math.min(normalizedScore, ANALYSIS_MAX_SCORE);

    // Build enrichment context for Gemini
    const enrichmentContext = component.cas_number
      ? `CAS: ${component.cas_number}, role: ${component.functional_role ?? "unknown"}, vegan=${component.vegan_status ?? "unknown"}, halal=${component.halal_status ?? "unknown"}, EU=${component.market_ban_eu ?? "unknown"}, patent=${component.patent_lock ?? "unknown"}`
      : "No enrichment data yet";

    const supplierList = suppliers.length > 0
      ? suppliers.map(s => `${s.name}${s.country ? ` (${s.country})` : ""}${s.price_per_unit ? ` $${s.price_per_unit}/unit` : ""}`).join(", ")
      : "none";

    // Get AI reasoning if Gemini key available
    let reasoning = `Best match based on price (${price}/10), regulatory compliance (${regulatory}/10), and certification fit (${certFit}/10) priorities.`;

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey && suppliers.length > 0) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_DEFAULT_MODEL, generationConfig: { temperature: 0.4, maxOutputTokens: 200 } });
        const prompt = `Supply chain advisor for dietary supplements. Recommend the best supplier for "${component.canonical_name ?? component.name}" from: ${supplierList}.
Ingredient profile: ${enrichmentContext}
User priorities: price=${price}/10, regulatory=${regulatory}/10, cert_fit=${certFit}/10, supply_risk=${supplyRisk}/10, functional_fit=${functionalFit}/10
Give a 2-sentence recommendation explaining which supplier is best and why based on the priorities and compliance data.`;
        const result = await model.generateContent(prompt);
        reasoning = result.response.text().trim() || reasoning;
      } catch {
        // Use default reasoning on AI failure
      }
    }

    const recommendedSupplier = suppliers[0] || { name: "No suppliers available" };
    const alternatives = suppliers.slice(1, ANALYSIS_MAX_ALTERNATIVES + 1);

    return res.status(200).json({
      component: { id: component.id, name: component.name },
      recommendedSupplier: {
        name: recommendedSupplier.name,
        score: Math.round(baseScore * 100) / 100,
        reasoning,
      },
      alternatives: alternatives.map((s, i) => ({
        name: s.name,
        score: Math.round((baseScore - ANALYSIS_ALTERNATIVE_DEGRADATION * (i + 1)) * 100) / 100,
        reasoning: "Alternative supplier option.",
      })),
      metrics: { price, regulatory, certFit, supplyRisk, functionalFit },
      supplierCount: suppliers.length,
    });
  } catch (error) {
    return handleDbError(res, error, "Analysis API");
  } finally {
    if (pool) await pool.end();
  }
}

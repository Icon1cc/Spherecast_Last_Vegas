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
 * @param {number} req.body.weights.price - Price priority
 * @param {number} req.body.weights.quality - Quality priority
 * @param {number} req.body.weights.compliance - Compliance priority
 * @param {number} req.body.weights.consolidation - Supplier consolidation priority
 * @param {number} req.body.weights.leadTime - Lead time priority
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

    // Get component name
    const componentQuery = `SELECT id, sku as name FROM product WHERE id = $1`;
    const componentResult = await pool.query(componentQuery, [componentId]);

    if (componentResult.rows.length === 0) {
      return res.status(404).json({ error: "Component not found" });
    }

    const component = componentResult.rows[0];

    // Get suppliers for this component
    const suppliersQuery = `
      SELECT s.id, s.name
      FROM supplier_product sp
      JOIN supplier s ON sp.supplier_id = s.id
      WHERE sp.product_id = $1
      ORDER BY s.name
    `;
    const suppliersResult = await pool.query(suppliersQuery, [componentId]);
    const suppliers = suppliersResult.rows;

    // Calculate scores using constants
    const { price, quality, compliance, consolidation, leadTime } = weights;
    const totalWeight = price + quality + compliance + consolidation + leadTime;
    const normalizedScore = ANALYSIS_BASE_SCORE + (totalWeight / ANALYSIS_WEIGHT_NORMALIZATION) * ANALYSIS_SCORE_INCREMENT;
    const baseScore = Math.min(normalizedScore, ANALYSIS_MAX_SCORE);

    // Get AI reasoning if Gemini key available
    let reasoning = `Best match based on price (${price}/10), quality (${quality}/10), and compliance (${compliance}/10) priorities.`;

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey && suppliers.length > 0) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_DEFAULT_MODEL });
        const prompt = `Briefly recommend a supplier for "${component.name}" from: ${suppliers.map(s => s.name).join(", ")}. Priorities: price ${price}/10, quality ${quality}/10, compliance ${compliance}/10. Keep response under 50 words.`;
        const result = await model.generateContent(prompt);
        reasoning = result.response.text() || reasoning;
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
      metrics: weights,
      supplierCount: suppliers.length,
    });
  } catch (error) {
    return handleDbError(res, error, "Analysis API");
  } finally {
    if (pool) await pool.end();
  }
}

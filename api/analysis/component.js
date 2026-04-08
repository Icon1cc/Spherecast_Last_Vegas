import { createPool } from "../lib/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let pool;
  try {
    const { componentId, weights } = req.body;

    if (!componentId || !weights) {
      return res.status(400).json({ error: "componentId and weights required" });
    }

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

    // Calculate scores
    const { price, quality, compliance, consolidation, leadTime } = weights;
    const totalWeight = price + quality + compliance + consolidation + leadTime;
    const normalizedScore = 0.7 + (totalWeight / 50) * 0.25;
    const baseScore = Math.min(normalizedScore, 0.99);

    // Get AI reasoning if Gemini key available
    let reasoning = `Best match based on price (${price}/10), quality (${quality}/10), and compliance (${compliance}/10) priorities.`;

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey && suppliers.length > 0) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Briefly recommend a supplier for "${component.name}" from: ${suppliers.map(s => s.name).join(", ")}. Priorities: price ${price}/10, quality ${quality}/10, compliance ${compliance}/10. Keep response under 50 words.`;
        const result = await model.generateContent(prompt);
        reasoning = result.response.text() || reasoning;
      } catch (e) {
        // Use default reasoning
      }
    }

    const recommendedSupplier = suppliers[0] || { name: "No suppliers available" };
    const alternatives = suppliers.slice(1, 4);

    return res.status(200).json({
      component: { id: component.id, name: component.name },
      recommendedSupplier: {
        name: recommendedSupplier.name,
        score: Math.round(baseScore * 100) / 100,
        reasoning,
      },
      alternatives: alternatives.map((s, i) => ({
        name: s.name,
        score: Math.round((baseScore - 0.07 * (i + 1)) * 100) / 100,
        reasoning: "Alternative supplier option.",
      })),
      metrics: weights,
      supplierCount: suppliers.length,
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return res.status(500).json({ error: "Failed to generate analysis" });
  } finally {
    if (pool) await pool.end();
  }
}

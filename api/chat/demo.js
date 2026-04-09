import { GoogleGenerativeAI } from "@google/generative-ai";
import { createPool } from "../lib/db.js";
import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  JARVIS_DEMO_SYSTEM_PROMPT,
} from "../lib/constants.js";
import { validateNonEmptyString } from "../lib/validation.js";

/**
 * Fetches product catalog for demo AI context.
 * @param {import('pg').Pool} pool - Database connection pool
 * @returns {Promise<Array|null>} Sample products or null on failure
 */
async function getProductsForDemo(pool) {
  if (!pool) return null;

  try {
    const result = await pool.query(`
      SELECT id, sku as name,
             (SELECT c.name FROM company c WHERE c.id = p.company_id) as company
      FROM product p
      WHERE type = 'finished-good'
      ORDER BY id
      LIMIT 20
    `);
    return result.rows;
  } catch {
    return null;
  }
}

/**
 * Fetches materials for a product
 * @param {import('pg').Pool} pool - Database connection pool
 * @param {number} productId - Product ID
 * @returns {Promise<Array|null>} Materials or null on failure
 */
async function getMaterialsForProduct(pool, productId) {
  if (!pool || !productId) return null;

  try {
    const result = await pool.query(`
      SELECT DISTINCT
        rm.id as material_id,
        rm.sku as material_name
      FROM product fg
      JOIN bom ON bom.finished_good_id = fg.id
      JOIN product rm ON rm.id = bom.raw_material_id
      WHERE fg.id = $1
      ORDER BY rm.sku
      LIMIT 10
    `, [productId]);
    return result.rows;
  } catch {
    return null;
  }
}

/**
 * POST /api/chat/demo
 * Demo-specific chat endpoint with navigation awareness.
 * @param {Object} req.body - Request body
 * @param {string} req.body.message - User message (required)
 * @param {Array} [req.body.history] - Previous chat messages
 * @param {boolean} [req.body.isDemo] - Demo mode flag
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API key not configured" });
  }

  try {
    const { message, history = [] } = req.body || {};

    const { valid, error } = validateNonEmptyString(message, "Message");
    if (!valid) {
      return res.status(400).json({ error });
    }

    // Get product data for context
    let products = null;
    let pool;
    try {
      pool = createPool();
      products = await getProductsForDemo(pool);
    } catch (dbError) {
      console.warn("Demo API DB context unavailable:", dbError);
    }

    // Build context-aware prompt with product info
    let contextPrompt = JARVIS_DEMO_SYSTEM_PROMPT;
    if (products && products.length > 0) {
      const productList = products.slice(0, 10).map(p =>
        `- ID ${p.id}: ${p.name} (${p.company || 'Unknown'})`
      ).join("\n");
      contextPrompt += `\n\nAvailable products in database:\n${productList}\n\nWhen user asks about products or analysis, use these real product IDs in navigation commands.`;
    }

    // For demo, we need to check if user mentioned a specific product to get materials
    const productIdMatch = message.match(/product\s*(?:id\s*)?(\d+)/i);
    if (productIdMatch && pool) {
      const productId = parseInt(productIdMatch[1], 10);
      const materials = await getMaterialsForProduct(pool, productId);
      if (materials && materials.length > 0) {
        const materialList = materials.map(m =>
          `- Material ID ${m.material_id}: ${m.material_name}`
        ).join("\n");
        contextPrompt += `\n\nMaterials for product ${productId}:\n${materialList}`;
      }
    }

    if (pool) await pool.end();

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_DEFAULT_MODEL });

    // Build chat history
    const chatHistory = [
      { role: "user", parts: [{ text: contextPrompt }] },
      { role: "model", parts: [{ text: "Ready to guide you through SupplyWise. What would you like to explore?" }] },
      ...history.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      })),
    ];

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        temperature: 0.4, // Lower temperature for more consistent demo responses
      },
    });

    const result = await chat.sendMessage(message);
    const response = result.response.text();

    return res.status(200).json({
      response: response || "Let me help you explore the system.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Demo Chat API error:", error);
    return res.status(500).json({ error: "Failed to process message" });
  }
}

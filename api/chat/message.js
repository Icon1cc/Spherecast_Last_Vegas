import { GoogleGenerativeAI } from "@google/generative-ai";
import { createPool } from "../lib/db.js";
import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_TEMPERATURE,
  JARVIS_SYSTEM_PROMPT,
} from "../lib/constants.js";
import { validateNonEmptyString } from "../lib/validation.js";

/**
 * Fetches database context for AI to reference.
 * @param {import('pg').Pool} pool - Database connection pool
 * @returns {Promise<Object|null>} Database statistics or null on failure
 */
async function getDbContext(pool) {
  if (!pool) return null;

  try {
    const [products, suppliers, companies] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM product WHERE type = 'finished-good'"),
      pool.query("SELECT COUNT(*) as count FROM supplier"),
      pool.query("SELECT COUNT(*) as count FROM company"),
    ]);

    return {
      productCount: parseInt(products.rows[0]?.count || "0"),
      supplierCount: parseInt(suppliers.rows[0]?.count || "0"),
      companyCount: parseInt(companies.rows[0]?.count || "0"),
    };
  } catch {
    return null;
  }
}

/**
 * POST /api/chat/message
 * Processes chat messages through Gemini AI with optional database context.
 * @param {Object} req.body - Request body
 * @param {string} req.body.message - User message (required)
 * @param {Array} [req.body.history] - Previous chat messages
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

    // DB context is optional for chat quality; do not block chat if DB is unavailable.
    let dbContext = null;
    let pool;
    try {
      pool = createPool();
      dbContext = await getDbContext(pool);
    } catch (dbError) {
      console.warn("Chat API DB context unavailable:", dbError);
    } finally {
      if (pool) await pool.end();
    }

    // Build context-aware prompt
    let contextPrompt = JARVIS_SYSTEM_PROMPT;
    if (dbContext) {
      contextPrompt += `\n\nDatabase context: ${dbContext.productCount} products, ${dbContext.supplierCount} suppliers, ${dbContext.companyCount} companies.`;
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_DEFAULT_MODEL });

    // Build chat history
    const chatHistory = [
      { role: "user", parts: [{ text: contextPrompt }] },
      { role: "model", parts: [{ text: "Understood. I'm Jarvis, ready to help with supply chain decisions. How can I assist you?" }] },
      ...history.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      })),
    ];

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        temperature: GEMINI_TEMPERATURE,
      },
    });

    const result = await chat.sendMessage(message);
    const response = result.response.text();

    return res.status(200).json({
      response: response || "I couldn't generate a response. Please try again.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({ error: "Failed to process message" });
  }
}

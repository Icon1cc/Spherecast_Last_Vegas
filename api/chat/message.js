import { GoogleGenerativeAI } from "@google/generative-ai";
import { createPool } from "../lib/db.js";
import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_TEMPERATURE,
  JARVIS_SYSTEM_PROMPT,
} from "../lib/constants.js";
import { validateNonEmptyString } from "../lib/validation.js";

/** Keywords that trigger search grounding */
const SEARCH_TRIGGERS = [
  "search", "look up", "find online", "current", "latest", "recent",
  "news", "today", "2024", "2025", "2026", "price", "market",
  "what is the", "who is", "where is", "when did", "how much",
  "regulation", "FDA", "EU regulation", "compliance update"
];

/**
 * Check if message likely needs web search
 */
function needsWebSearch(message) {
  const lowerMessage = message.toLowerCase();
  return SEARCH_TRIGGERS.some(trigger => lowerMessage.includes(trigger));
}

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
 * Supports Google Search grounding for real-time information.
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

    // Check if we should use search grounding
    const useSearch = needsWebSearch(message);

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    let response;
    let searchGroundingUsed = false;

    if (useSearch) {
      // Use the same model with Google Search grounding tool
      try {
        const searchModel = genAI.getGenerativeModel({
          model: GEMINI_DEFAULT_MODEL,
          generationConfig: {
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
            temperature: GEMINI_TEMPERATURE,
          },
          // Enable Google Search grounding
          tools: [{
            googleSearch: {}
          }],
        });

        // Build the prompt with context
        const searchPrompt = `${contextPrompt}

You have access to Google Search for real-time information. Use it when answering questions about current prices, regulations, news, or any time-sensitive information.

User question: ${message}

Provide a helpful, accurate response. If you used search results, mention the source briefly.`;

        const result = await searchModel.generateContent(searchPrompt);
        response = result.response.text();
        searchGroundingUsed = true;

        // Check if grounding metadata is available
        const groundingMetadata = result.response.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata?.groundingChunks?.length > 0) {
          // Append sources if available
          const sources = groundingMetadata.groundingChunks
            .filter(chunk => chunk.web?.uri)
            .slice(0, 3)
            .map(chunk => chunk.web.title || chunk.web.uri);

          if (sources.length > 0) {
            response += `\n\n*Sources: ${sources.join(", ")}*`;
          }
        }
      } catch (searchErr) {
        console.warn("Search grounding failed, falling back to standard chat:", searchErr.message);
        // Fall through to standard model
      }
    }

    // Standard model (no search) or fallback
    if (!response) {
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
      response = result.response.text();
    }

    return res.status(200).json({
      response: response || "I couldn't generate a response. Please try again.",
      timestamp: new Date().toISOString(),
      searchUsed: searchGroundingUsed,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({ error: "Failed to process message" });
  }
}

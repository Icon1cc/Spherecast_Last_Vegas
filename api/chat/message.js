import { GoogleGenerativeAI } from "@google/generative-ai";
import { createPool } from "../lib/db.js";
import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_TEMPERATURE,
  AGNES_DEMO_SYSTEM_PROMPT,
  AGNES_SYSTEM_PROMPT,
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
 * Fetches materials for a product.
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
 * Searches raw materials by keyword extracted from the user message.
 * Returns material_id + a product_id that contains it, so Agnes can navigate directly.
 * @param {import('pg').Pool} pool
 * @param {string} userMessage
 * @returns {Promise<Array|null>} [{material_id, material_name, product_id, product_name}]
 */
async function searchMaterialsByKeyword(pool, userMessage) {
  if (!pool) return null;

  // Extract candidate keywords: 3+ char words (no stop-word filter — ingredient names ARE meaningful)
  const words = (userMessage.match(/\b[a-zA-Z0-9][a-zA-Z0-9\-]{2,}\b/g) || [])
    .map(w => w.toLowerCase());

  // Also detect "vitamin X" patterns explicitly
  const vitaminMatch = userMessage.match(/vitamin\s+([a-z]\d*)/gi);
  if (vitaminMatch) {
    vitaminMatch.forEach(v => words.unshift(v.replace(/\s+/, ' ').toLowerCase()));
  }

  const keywords = [...new Set(words)].slice(0, 6);
  if (keywords.length === 0) return null;

  try {
    // Build OR conditions: one ILIKE per keyword
    const conditions = keywords.map((_, i) => `LOWER(rm.sku) ILIKE $${i + 1}`).join(' OR ');
    const params = keywords.map(k => `%${k}%`);

    const result = await pool.query(`
      SELECT DISTINCT ON (rm.id)
        rm.id   AS material_id,
        rm.sku  AS material_name,
        fg.id   AS product_id,
        fg.sku  AS product_name
      FROM product rm
      JOIN bom          ON bom.raw_material_id  = rm.id
      JOIN product fg   ON fg.id                = bom.finished_good_id
      WHERE rm.type = 'raw-material'
        AND (${conditions})
      ORDER BY rm.id
      LIMIT 5
    `, params);

    return result.rows.length > 0 ? result.rows : null;
  } catch {
    return null;
  }
}

/**
 * Searches finished goods by keyword so Agnes can navigate to a product by SKU.
 * @param {import('pg').Pool} pool
 * @param {string} userMessage
 * @returns {Promise<Array|null>} [{product_id, product_name}]
 */
async function searchProductsByKeyword(pool, userMessage) {
  if (!pool) return null;

  // Pull SKU-like tokens (contains dash or alphanumeric, 3+ chars) and plain words
  const tokens = (userMessage.match(/\b[a-zA-Z0-9][a-zA-Z0-9\-]{2,}\b/g) || [])
    .map(w => w.toLowerCase());

  const skipWords = new Set([
    'supplement', 'supply', 'supplier', 'alternative', 'sourcing', 'show', 'tell',
    'find', 'open', 'navigate', 'what', 'which', 'that', 'this', 'with', 'from',
    'want', 'need', 'have', 'help', 'please', 'page', 'view', 'ingredient',
  ]);
  const keywords = [...new Set(tokens.filter(t => !skipWords.has(t)))].slice(0, 6);
  if (keywords.length === 0) return null;

  try {
    const conditions = keywords.map((_, i) => `LOWER(p.sku) ILIKE $${i + 1}`).join(' OR ');
    const params = keywords.map(k => `%${k}%`);

    const result = await pool.query(`
      SELECT p.id AS product_id, p.sku AS product_name
      FROM product p
      WHERE p.type = 'finished-good'
        AND (${conditions})
      ORDER BY p.id
      LIMIT 5
    `, params);

    return result.rows.length > 0 ? result.rows : null;
  } catch {
    return null;
  }
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
    const { message, history = [], isDemo = false, pageContext = null } = req.body || {};
    const demoMode = Boolean(isDemo);

    const { valid, error } = validateNonEmptyString(message, "Message");
    if (!valid) {
      return res.status(400).json({ error });
    }

    // DB context is optional; do not block chat if DB is unavailable.
    let dbContext = null;
    let products = null;
    let demoMaterials = null;
    let ingredientMatches = null;
    let pool;
    try {
      pool = createPool();
      // Always fetch navigation context so Agnes can use real IDs in both demo and regular chat
      let productMatches = null;
      [products, ingredientMatches, productMatches, dbContext] = await Promise.all([
        getProductsForDemo(pool),
        searchMaterialsByKeyword(pool, message),
        searchProductsByKeyword(pool, message),
        getDbContext(pool),
      ]);
      // Merge product matches into products list (avoid duplicates)
      if (productMatches && productMatches.length > 0) {
        const existingIds = new Set((products || []).map(p => p.id));
        const newProducts = productMatches.filter(p => !existingIds.has(p.product_id))
          .map(p => ({ id: p.product_id, name: p.product_name, company: null }));
        products = [...(products || []), ...newProducts];
      }
      // Also fetch materials for an explicitly referenced product ID
      const productIdMatch = message.match(/product\s*(?:id\s*)?(\d+)/i);
      if (productIdMatch) {
        const productId = parseInt(productIdMatch[1], 10);
        demoMaterials = await getMaterialsForProduct(pool, productId);
      }
    } catch (dbError) {
      console.warn("Chat API DB context unavailable:", dbError);
    } finally {
      if (pool) await pool.end();
    }

    // Build context-aware prompt
    let contextPrompt = demoMode ? AGNES_DEMO_SYSTEM_PROMPT : AGNES_SYSTEM_PROMPT;
    if (dbContext) {
      contextPrompt += `\n\nDatabase context: ${dbContext.productCount} products, ${dbContext.supplierCount} suppliers, ${dbContext.companyCount} companies.`;
    }
    if (products && products.length > 0) {
      const productList = products
        .slice(0, 10)
        .map((product) => `- ID ${product.id}: ${product.name} (${product.company || "Unknown"})`)
        .join("\n");
      contextPrompt += `\n\nAvailable finished goods:\n${productList}`;
    }
    if (ingredientMatches && ingredientMatches.length > 0) {
      // Real material_id + product_id pairs Agnes can use directly in NAV commands
      const matchList = ingredientMatches
        .map(m => `- "${m.material_name}" → materialId=${m.material_id} in productId=${m.product_id} ("${m.product_name}")`)
        .join("\n");
      contextPrompt += `\n\nMatching raw materials found in database for this query:\n${matchList}\n\nUse these EXACT IDs in [NAV:ANALYSIS:productId:materialId:productName:materialName] commands. Do NOT invent IDs.`;
    }
    if (demoMaterials && demoMaterials.length > 0) {
      const materialList = demoMaterials
        .map((material) => `- Material ID ${material.material_id}: ${material.material_name}`)
        .join("\n");
      contextPrompt += `\n\nMaterials for referenced product:\n${materialList}`;
    }

    // Inject page context so Agnes knows what the user is currently viewing
    if (pageContext && pageContext.materialId) {
      const productLabel = pageContext.productName || `product ID ${pageContext.productId}`;
      const materialLabel = pageContext.materialName || `material ID ${pageContext.materialId}`;
      contextPrompt += `\n\nCURRENT PAGE CONTEXT: The user is on the supplier analysis page for "${materialLabel}" (materialId=${pageContext.materialId}) within product "${productLabel}" (productId=${pageContext.productId}). When the user asks about suppliers, compliance, or ingredient details WITHOUT specifying a different product, answer specifically about "${materialLabel}". Do NOT ask them to select a product — they are already viewing one.`;
    } else if (pageContext && pageContext.productId) {
      const productLabel = pageContext.productName || `product ID ${pageContext.productId}`;
      contextPrompt += `\n\nCURRENT PAGE CONTEXT: The user is viewing the ingredients list for "${productLabel}" (productId=${pageContext.productId}).`;
    }

    // Check if we should use search grounding
    const useSearch = !demoMode && needsWebSearch(message);

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    // Build shared chat history (used by both paths)
    const chatHistory = [
      { role: "user", parts: [{ text: contextPrompt }] },
      {
        role: "model",
        parts: [{
          text: demoMode
            ? "Ready to guide you through SupplyWise. What would you like to explore?"
            : "Understood. I'm Agnes, ready to help with supply chain decisions. How can I assist you?",
        }],
      },
      ...history.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      })),
    ];

    let response;
    let searchGroundingUsed = false;

    if (useSearch) {
      // Use startChat (not generateContent) so history is preserved
      try {
        const searchModel = genAI.getGenerativeModel({
          model: GEMINI_DEFAULT_MODEL,
          generationConfig: {
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
            temperature: GEMINI_TEMPERATURE,
          },
          tools: [{ googleSearch: {} }],
        });

        const chat = searchModel.startChat({ history: chatHistory });
        const result = await chat.sendMessage(message);
        response = result.response.text();
        searchGroundingUsed = true;

        // Append sources if grounding metadata available
        const groundingMetadata = result.response.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata?.groundingChunks?.length > 0) {
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
        // Fall through to standard model below
      }
    }

    // Standard model (no search) or fallback
    if (!response) {
      const model = genAI.getGenerativeModel({ model: GEMINI_DEFAULT_MODEL });
      const chat = model.startChat({
        history: chatHistory,
        generationConfig: {
          // Demo mode: very short responses (max ~50 words)
          // Regular mode: longer responses allowed
          maxOutputTokens: demoMode ? 150 : GEMINI_MAX_OUTPUT_TOKENS,
          temperature: demoMode ? 0.3 : GEMINI_TEMPERATURE,
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

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

function needsWebSearch(message) {
  const lowerMessage = message.toLowerCase();
  return SEARCH_TRIGGERS.some(trigger => lowerMessage.includes(trigger));
}

/**
 * Fetches all finished goods and all raw materials (with one representative parent product each).
 * Agnes uses this full list to semantically match user intent → real IDs → NAV commands.
 * No ILIKE keyword matching — Gemini does the matching.
 */
async function getFullNavigationContext(pool) {
  if (!pool) return null;

  try {
    const [productsResult, materialsResult] = await Promise.all([
      pool.query(`
        SELECT id, sku AS name
        FROM product
        WHERE type = 'finished-good'
        ORDER BY id
      `),
      pool.query(`
        SELECT DISTINCT ON (rm.id)
          rm.id   AS material_id,
          rm.sku  AS material_name,
          fg.id   AS product_id,
          fg.sku  AS product_name
        FROM product rm
        JOIN bom        ON bom.raw_material_id = rm.id
        JOIN product fg ON fg.id               = bom.finished_good_id
        WHERE rm.type = 'raw-material'
        ORDER BY rm.id
      `),
    ]);

    return {
      finishedGoods: productsResult.rows,
      rawMaterials: materialsResult.rows,
    };
  } catch {
    return null;
  }
}

/**
 * Fetches database statistics for general context.
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

    // Fetch navigation context + DB stats in parallel — no ILIKE, Gemini does the matching
    let navContext = null;
    let dbContext = null;
    let pool;
    try {
      pool = createPool();
      [navContext, dbContext] = await Promise.all([
        getFullNavigationContext(pool),
        getDbContext(pool),
      ]);
    } catch (dbError) {
      console.warn("Chat API DB context unavailable:", dbError);
    } finally {
      if (pool) await pool.end();
    }

    // Build context-aware prompt
    let contextPrompt = demoMode ? AGNES_DEMO_SYSTEM_PROMPT : AGNES_SYSTEM_PROMPT;

    if (dbContext) {
      contextPrompt += `\n\nDatabase: ${dbContext.productCount} finished goods, ${dbContext.supplierCount} suppliers, ${dbContext.companyCount} companies.`;
    }

    if (navContext) {
      // Full product list — Agnes matches user-mentioned SKUs/names semantically
      const productList = navContext.finishedGoods
        .map(p => `  productId=${p.id}: "${p.name}"`)
        .join("\n");
      contextPrompt += `\n\nPRODUCTS (use [NAV:PRODUCT:id:name] to open BOM/ingredients):\n${productList}`;

      // Full raw materials list with parent product — Agnes picks by ingredient name/synonym
      const materialList = navContext.rawMaterials
        .map(m => `  materialId=${m.material_id}, productId=${m.product_id}: "${m.material_name}" (in "${m.product_name}")`)
        .join("\n");
      contextPrompt += `\n\nRAW MATERIALS (use [NAV:ANALYSIS:productId:materialId:productName:materialName] to open supplier analysis):\n${materialList}\n\nMatch user intent to the correct IDs above. Use EXACT IDs — never invent them.`;
    }

    // Inject current page context so Agnes stays focused on what the user is viewing
    if (pageContext?.materialId) {
      const productLabel = pageContext.productName || `product ID ${pageContext.productId}`;
      const materialLabel = pageContext.materialName || `material ID ${pageContext.materialId}`;
      contextPrompt += `\n\nCURRENT PAGE: User is on the supplier analysis page for "${materialLabel}" (materialId=${pageContext.materialId}) in "${productLabel}" (productId=${pageContext.productId}). Answer about this material unless the user asks about something else. Do NOT ask them to select a product.`;
    } else if (pageContext?.productId) {
      const productLabel = pageContext.productName || `product ID ${pageContext.productId}`;
      contextPrompt += `\n\nCURRENT PAGE: User is viewing the BOM for "${productLabel}" (productId=${pageContext.productId}).`;
    }

    const useSearch = !demoMode && needsWebSearch(message);
    const genAI = new GoogleGenerativeAI(apiKey);

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
      }
    }

    if (!response) {
      const model = genAI.getGenerativeModel({ model: GEMINI_DEFAULT_MODEL });
      const chat = model.startChat({
        history: chatHistory,
        generationConfig: {
          maxOutputTokens: demoMode ? 512 : GEMINI_MAX_OUTPUT_TOKENS,
          temperature: demoMode ? 0.4 : GEMINI_TEMPERATURE,
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

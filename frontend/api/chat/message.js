import { GoogleGenerativeAI } from "@google/generative-ai";
import pg from "pg";

const SYSTEM_PROMPT = `You are Jarvis, an AI assistant for SupplyWise - a supply chain decision-support system for CPG (Consumer Packaged Goods) companies.

Your capabilities:
- Help users understand their product catalog and Bill of Materials (BOM)
- Analyze raw materials and suggest sourcing recommendations
- Find interchangeable components (substitutes)
- Evaluate suppliers based on quality, compliance, cost, and lead time
- Provide clear reasoning and evidence for recommendations

Guidelines:
- Be concise but informative
- Mention confidence levels when making recommendations
- If you don't have enough data, say so
- Keep responses conversational and helpful`;

function createPool() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) return null;

  return new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
}

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API key not configured" });
  }

  let pool;
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    // Get database context
    pool = createPool();
    const dbContext = await getDbContext(pool);

    // Build context-aware prompt
    let contextPrompt = SYSTEM_PROMPT;
    if (dbContext) {
      contextPrompt += `\n\nDatabase context: ${dbContext.productCount} products, ${dbContext.supplierCount} suppliers, ${dbContext.companyCount} companies.`;
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
        maxOutputTokens: 1024,
        temperature: 0.7,
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
  } finally {
    if (pool) await pool.end();
  }
}

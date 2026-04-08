import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from parent directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const PORT = 3001;

app.use(cors());

// Parse JSON for most routes
app.use((req, res, next) => {
  // Skip JSON parsing for multipart requests (STT)
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return next();
  }
  express.json()(req, res, next);
});

// Dynamic handler loader
async function loadHandler(handlerPath) {
  const fullPath = path.resolve(__dirname, handlerPath);
  const module = await import(fullPath);
  return module.default;
}

// ElevenLabs TTS
app.post("/api/elevenlabs/tts", async (req, res) => {
  try {
    const handler = await loadHandler("./api/elevenlabs/tts.js");
    await handler(req, res);
  } catch (error) {
    console.error("TTS error:", error);
    res.status(500).json({ error: String(error) });
  }
});

// ElevenLabs STT - needs raw body passthrough
app.post("/api/elevenlabs/stt", async (req, res) => {
  try {
    const handler = await loadHandler("./api/elevenlabs/stt.js");
    await handler(req, res);
  } catch (error) {
    console.error("STT error:", error);
    res.status(500).json({ error: String(error) });
  }
});

// Chat message
app.post("/api/chat/message", async (req, res) => {
  try {
    const handler = await loadHandler("./api/chat/message.js");
    await handler(req, res);
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: String(error) });
  }
});

// Products list
app.get("/api/products", async (req, res) => {
  try {
    const handler = await loadHandler("./api/products/index.js");
    await handler(req, res);
  } catch (error) {
    console.error("Products error:", error);
    res.status(500).json({ error: String(error) });
  }
});

// Product BOM
app.get("/api/products/:id/bom", async (req, res) => {
  try {
    req.query.id = req.params.id;
    const handler = await loadHandler("./api/products/[id]/bom.js");
    await handler(req, res);
  } catch (error) {
    console.error("BOM error:", error);
    res.status(500).json({ error: String(error) });
  }
});

// Analysis
app.post("/api/analysis/component", async (req, res) => {
  try {
    const handler = await loadHandler("./api/analysis/component.js");
    await handler(req, res);
  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});

import { Buffer } from "node:buffer";
import { ELEVENLABS_BASE_URL } from "../lib/constants.js";

/**
 * Reads the raw request body as a Buffer.
 * @param {import('http').IncomingMessage} req - Request object
 * @returns {Promise<Buffer>} Raw body buffer
 */
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * POST /api/elevenlabs/stt
 * Proxies speech-to-text requests to ElevenLabs API.
 * @param {Object} req - Request with multipart/form-data body containing audio file
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "Missing ELEVENLABS_API_KEY on server" });
  }

  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.includes("multipart/form-data")) {
    return res.status(400).json({ error: "Expected multipart/form-data payload" });
  }

  try {
    const rawBody = await readRawBody(req);

    const upstream = await fetch(`${ELEVENLABS_BASE_URL}/speech-to-text`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": contentType,
      },
      body: rawBody,
    });

    const responseText = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    return res.send(responseText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown STT error";
    return res.status(500).json({ error: message });
  }
}

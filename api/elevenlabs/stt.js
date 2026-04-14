import { Buffer } from "node:buffer";
import { ELEVENLABS_BASE_URL } from "../lib/constants.js";

/**
 * Parses multipart form data to extract the file and add language_code
 * @param {Buffer} buffer - Raw body buffer
 * @param {string} boundary - Multipart boundary string
 * @returns {Buffer} Modified form data with language_code=en
 */
function addLanguageCodeToFormData(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);
  const crlfBuffer = Buffer.from("\r\n");

  // Create the language_code field
  const languageField = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language_code"\r\n\r\n` +
    `en\r\n`
  );

  // Find the end boundary position
  const bodyStr = buffer.toString("binary");
  const endBoundaryPos = bodyStr.lastIndexOf(`--${boundary}--`);

  if (endBoundaryPos === -1) {
    // No end boundary found, just return original
    return buffer;
  }

  // Insert language field before the end boundary
  const beforeEnd = buffer.subarray(0, endBoundaryPos);
  const afterEnd = buffer.subarray(endBoundaryPos);

  return Buffer.concat([beforeEnd, languageField, afterEnd]);
}

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
 * Forces English language detection to prevent hallucination in other languages.
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
    let rawBody = await readRawBody(req);

    // Extract boundary from content-type
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1].replace(/^["']|["']$/g, "");
      // Add language_code=en to force English transcription
      rawBody = addLanguageCodeToFormData(rawBody, boundary);
    }

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
    console.error("[STT API] Error:", message);
    return res.status(500).json({ error: message });
  }
}

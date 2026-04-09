import { Buffer } from "node:buffer";
import {
  ELEVENLABS_BASE_URL,
  ELEVENLABS_DEFAULT_VOICE_ID,
  ELEVENLABS_DEFAULT_TTS_MODEL,
  ELEVENLABS_DEFAULT_OPTIMIZE_LATENCY,
  ELEVENLABS_MAX_OPTIMIZE_LATENCY,
  CONTENT_TYPE_AUDIO,
} from "../lib/constants.js";
import { validateNonEmptyString, validateOptionalString, validateOptionalIntegerInRange } from "../lib/validation.js";

/**
 * Reads the raw request body as a Buffer.
 * Required for Vercel serverless functions that don't auto-parse JSON.
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
 * POST /api/elevenlabs/tts
 * Proxies text-to-speech requests to ElevenLabs API.
 * @param {Object} req.body - Request body
 * @param {string} req.body.text - Text to convert to speech (required)
 * @param {string} [req.body.voiceId] - Voice ID (default: s3TPKV1kjDlVtZbl4Ksh)
 * @param {string} [req.body.modelId] - Model ID (default: eleven_multilingual_v2)
 * @param {number} [req.body.optimizeLatency] - Latency optimization 0-4 (default: 3)
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

  try {
    // Support both pre-parsed body (Express) and raw body (Vercel)
    let payload;
    if (req.body && typeof req.body === "object") {
      payload = req.body;
    } else {
      const rawBody = await readRawBody(req);
      payload = JSON.parse(rawBody.toString("utf-8"));
    }

    const { valid: textValid, value: text, error: textError } = validateNonEmptyString(payload.text, "text");
    if (!textValid) {
      return res.status(400).json({ error: textError });
    }

    const voiceId = validateOptionalString(payload.voiceId, ELEVENLABS_DEFAULT_VOICE_ID);
    const modelId = validateOptionalString(payload.modelId, ELEVENLABS_DEFAULT_TTS_MODEL);
    const optimizeLatency = validateOptionalIntegerInRange(
      payload.optimizeLatency,
      ELEVENLABS_DEFAULT_OPTIMIZE_LATENCY,
      0,
      ELEVENLABS_MAX_OPTIMIZE_LATENCY
    );

    const ttsUrl = new URL(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`);
    ttsUrl.searchParams.set("optimize_streaming_latency", String(optimizeLatency));

    const upstream = await fetch(ttsUrl.toString(), {
      method: "POST",
      headers: {
        Accept: CONTENT_TYPE_AUDIO,
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return res.status(upstream.status).json({
        error: errorText || "ElevenLabs TTS request failed",
      });
    }

    const audioBuffer = Buffer.from(await upstream.arrayBuffer());
    res.status(200);
    res.setHeader("Content-Type", CONTENT_TYPE_AUDIO);
    res.setHeader("Cache-Control", "no-store");
    return res.send(audioBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown TTS error";
    return res.status(500).json({ error: message });
  }
}

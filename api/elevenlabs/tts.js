import { Buffer } from "node:buffer";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "s3TPKV1kjDlVtZbl4Ksh";
const DEFAULT_TTS_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OPTIMIZE_LATENCY = 3;

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    res.status(500).json({ error: "Missing ELEVENLABS_API_KEY on server" });
    return;
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

    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    const voiceId =
      typeof payload.voiceId === "string" && payload.voiceId.trim()
        ? payload.voiceId.trim()
        : DEFAULT_VOICE_ID;
    const modelId =
      typeof payload.modelId === "string" && payload.modelId.trim()
        ? payload.modelId.trim()
        : DEFAULT_TTS_MODEL_ID;
    const optimizeLatencyRaw = Number.parseInt(String(payload.optimizeLatency ?? ""), 10);
    const optimizeLatency = Number.isNaN(optimizeLatencyRaw)
      ? DEFAULT_OPTIMIZE_LATENCY
      : Math.max(0, Math.min(4, optimizeLatencyRaw));

    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const ttsUrl = new URL(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`);
    ttsUrl.searchParams.set("optimize_streaming_latency", String(optimizeLatency));

    const upstream = await fetch(ttsUrl.toString(), {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
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
      res.status(upstream.status).json({
        error: errorText || "ElevenLabs TTS request failed",
      });
      return;
    }

    const audioBuffer = Buffer.from(await upstream.arrayBuffer());
    res.status(200);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audioBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown TTS error";
    res.status(500).json({ error: message });
  }
}

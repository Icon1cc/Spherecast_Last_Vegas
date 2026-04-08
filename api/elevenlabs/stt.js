import { Buffer } from "node:buffer";

const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";

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

  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.includes("multipart/form-data")) {
    res.status(400).json({ error: "Expected multipart/form-data payload" });
    return;
  }

  try {
    const rawBody = await readRawBody(req);

    const upstream = await fetch(ELEVENLABS_STT_URL, {
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
    res.send(responseText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown STT error";
    res.status(500).json({ error: message });
  }
}

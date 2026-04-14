/**
 * Voice Utilities for Agnes AI Assistant
 * Centralized voice configuration and text processing functions
 * Used by both ChatPanel and useVoiceIO hook
 */

// =============================================================================
// ElevenLabs Configuration
// =============================================================================

const DEFAULT_ELEVENLABS_VOICE_ID = "s3TPKV1kjDlVtZbl4Ksh";

export const VOICE_CONFIG = {
  // ElevenLabs API settings
  voiceId: import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() || DEFAULT_ELEVENLABS_VOICE_ID,
  ttsModelId: import.meta.env.VITE_ELEVENLABS_TTS_MODEL_ID?.trim() || "eleven_multilingual_v2",
  sttModelId: import.meta.env.VITE_ELEVENLABS_STT_MODEL_ID?.trim() || "scribe_v1",

  // Voice detection thresholds (tuned for reliable speech detection with noise filtering)
  baseSilenceThreshold: 0.035,        // Filter ambient noise
  minDynamicSilenceThreshold: 0.025,  // Minimum threshold for quiet rooms
  maxDynamicSilenceThreshold: 0.10,   // Maximum for noisy environments
  silenceThresholdMultiplier: 2.5,    // Multiplier for dynamic threshold

  // Timing constants (milliseconds) - ALLOW PAUSES FOR BREATHING
  noiseCalibrationMs: 500,    // Calibration period for ambient noise
  silenceDurationMs: 1800,    // INCREASED from 800 - allow 1.8 seconds of silence before ending
  noSpeechTimeoutMs: 12000,   // INCREASED from 8000 - wait 12 seconds if no speech at all
  maxRecordingMs: 30000,      // INCREASED from 20000 - allow longer recordings
  minRecordingMs: 1200,       // INCREASED from 500 - minimum 1.2 seconds before checking silence

  // Noise filtering - consecutive frames required to confirm speech
  minSpeechFrames: 3,         // Require 3 consecutive frames above threshold
  noiseFloorDecay: 0.98,      // Slowly decay noise floor estimate

  // Audio validation
  minAudioDurationMs: 500,    // NEW: Minimum audio duration to be valid
  minAudioBytesForStt: 2048,  // INCREASED from 1024 - ensure enough data for valid audio

  // TTS chunking
  ttsChunkMaxChars: 150,      // Smaller chunks for faster playback start
} as const;

// Supported MIME types for MediaRecorder (in preference order)
export const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

// =============================================================================
// Text Processing for TTS
// =============================================================================

/**
 * Normalize text for speech synthesis
 * Removes markdown formatting, code blocks, and cleans up whitespace
 */
export function normalizeTextForSpeech(text: string): string {
  return text
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, " ")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove markdown links, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove bold markdown
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // Remove italic markdown
    .replace(/\*([^*]+)\*/g, "$1")
    // Remove bullet points
    .replace(/^\s*[-*]\s+/gm, "")
    // Remove numbered lists prefix
    .replace(/^\s*\d+\.\s+/gm, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split text into chunks suitable for TTS streaming
 * Chunks at sentence boundaries when possible
 */
export function splitTextForSpeech(
  text: string,
  maxChars: number = VOICE_CONFIG.ttsChunkMaxChars
): string[] {
  const normalized = normalizeTextForSpeech(text);
  if (!normalized) return [];

  // Split by sentence endings
  const sentences =
    normalized.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [normalized];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }

    const candidate = `${current} ${sentence}`.trim();
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// =============================================================================
// Audio Utilities
// =============================================================================

/**
 * Get the AudioContext class (with webkit fallback)
 */
export function getAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/**
 * Pick the best supported MediaRecorder MIME type
 */
export function pickSupportedRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }
  return RECORDER_MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
}

/**
 * Get file extension for a MIME type
 */
export function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  return "webm";
}

/**
 * Calculate RMS (Root Mean Square) from audio waveform data
 * Used for voice activity detection
 */
export function calculateRMS(waveform: Uint8Array): number {
  let sum = 0;
  for (const sample of waveform) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / waveform.length);
}

/**
 * Calculate dynamic silence threshold based on ambient noise
 */
export function calculateDynamicThreshold(
  calibrationAverage: number,
  config = VOICE_CONFIG
): number {
  return Math.max(
    config.minDynamicSilenceThreshold,
    Math.min(
      config.maxDynamicSilenceThreshold,
      Math.max(config.baseSilenceThreshold, calibrationAverage * config.silenceThresholdMultiplier)
    )
  );
}

// =============================================================================
// Navigation Command Parsing
// =============================================================================

export interface NavCommand {
  type: "DASHBOARD" | "PRODUCT" | "ANALYSIS";
  productId?: number;
  materialId?: number;
  productName?: string;
  materialName?: string;
}

export interface ParsedResponse {
  cleanText: string;
  navCommands: NavCommand[];
  action?: "END_DEMO" | "SHOW_PRODUCTS" | "CONTINUE";
  highlights: string[];
}

/**
 * Parse navigation commands from AI response text
 * Extracts [NAV:...], [ACTION:...], and [HIGHLIGHT:...] commands
 */
export function parseNavigationCommands(text: string): ParsedResponse {
  const navCommands: NavCommand[] = [];
  const highlights: string[] = [];
  let action: ParsedResponse["action"];
  let cleanText = text;

  // Parse [NAV:DASHBOARD]
  const dashboardMatches = text.matchAll(/\[NAV:DASHBOARD\]/gi);
  for (const match of dashboardMatches) {
    navCommands.push({ type: "DASHBOARD" });
    cleanText = cleanText.replace(match[0], "");
  }

  // Parse [NAV:PRODUCT:id:name]
  const productMatches = text.matchAll(/\[NAV:PRODUCT:(\d+):([^\]]+)\]/gi);
  for (const match of productMatches) {
    navCommands.push({
      type: "PRODUCT",
      productId: parseInt(match[1], 10),
      productName: match[2].trim().replace(/_/g, " "),
    });
    cleanText = cleanText.replace(match[0], "");
  }

  // Parse [NAV:ANALYSIS:productId:materialId:productName:materialName]
  const analysisMatches = text.matchAll(/\[NAV:ANALYSIS:(\d+):(\d+):([^:]+):([^\]]+)\]/gi);
  for (const match of analysisMatches) {
    navCommands.push({
      type: "ANALYSIS",
      productId: parseInt(match[1], 10),
      materialId: parseInt(match[2], 10),
      productName: match[3].trim().replace(/_/g, " "),
      materialName: match[4].trim().replace(/_/g, " "),
    });
    cleanText = cleanText.replace(match[0], "");
  }

  // Parse [ACTION:...]
  const actionMatch = text.match(/\[ACTION:(\w+)\]/i);
  if (actionMatch) {
    const actionType = actionMatch[1].toUpperCase();
    if (actionType === "END_DEMO") action = "END_DEMO";
    else if (actionType === "SHOW_PRODUCTS") action = "SHOW_PRODUCTS";
    else if (actionType === "CONTINUE") action = "CONTINUE";
    cleanText = cleanText.replace(actionMatch[0], "");
  }

  // Parse [HIGHLIGHT:...]
  const highlightMatches = text.matchAll(/\[HIGHLIGHT:([^\]]+)\]/gi);
  for (const match of highlightMatches) {
    highlights.push(match[1].trim());
    cleanText = cleanText.replace(match[0], "");
  }

  // Clean up whitespace
  cleanText = cleanText.replace(/\s{2,}/g, " ").trim();

  return { cleanText, navCommands, action, highlights };
}

// =============================================================================
// Greeting constant
// =============================================================================

export const AGNES_GREETING = "Hello, I'm Agnes. How can I help you today?";
export const AGNES_DEMO_GREETING = "Hi, I'm Agnes! What would you like to explore?";

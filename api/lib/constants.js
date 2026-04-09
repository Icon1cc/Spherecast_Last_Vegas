/**
 * @fileoverview Shared constants for API routes.
 * Centralizes all magic strings, numbers, and configuration values.
 */

// =============================================================================
// Database Configuration
// =============================================================================

/** Default maximum connections in the database pool */
export const DB_POOL_MAX_CONNECTIONS = 5;

/** Idle timeout for database connections (ms) */
export const DB_POOL_IDLE_TIMEOUT_MS = 30000;

/** Cache duration for product-related endpoints (seconds) */
export const CACHE_MAX_AGE_SECONDS = 60;

// =============================================================================
// Pagination Defaults
// =============================================================================

/** Default page number for pagination */
export const DEFAULT_PAGE = 1;

/** Default items per page for product listing */
export const DEFAULT_LIMIT = 20;

/** Maximum allowed items per page */
export const MAX_LIMIT = 100;

/** Minimum allowed items per page */
export const MIN_LIMIT = 1;

// =============================================================================
// ElevenLabs Configuration
// =============================================================================

/** ElevenLabs API base URL */
export const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

/** Default voice ID for TTS (Rachel voice) */
export const ELEVENLABS_DEFAULT_VOICE_ID = "s3TPKV1kjDlVtZbl4Ksh";

/** Default TTS model ID */
export const ELEVENLABS_DEFAULT_TTS_MODEL = "eleven_multilingual_v2";

/** Default STT model ID */
export const ELEVENLABS_DEFAULT_STT_MODEL = "scribe_v1";

/** Default latency optimization level (0-4, higher = faster but lower quality) */
export const ELEVENLABS_DEFAULT_OPTIMIZE_LATENCY = 3;

/** Maximum latency optimization level */
export const ELEVENLABS_MAX_OPTIMIZE_LATENCY = 4;

// =============================================================================
// Gemini Configuration
// =============================================================================

/** Default Gemini model for chat */
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

/** Maximum output tokens for Gemini responses */
export const GEMINI_MAX_OUTPUT_TOKENS = 1024;

/** Temperature for Gemini responses (0-1, higher = more creative) */
export const GEMINI_TEMPERATURE = 0.7;

// =============================================================================
// Analysis Algorithm Constants
// =============================================================================

/** Base score for supplier recommendations (0-1) */
export const ANALYSIS_BASE_SCORE = 0.7;

/** Maximum possible score for supplier recommendations */
export const ANALYSIS_MAX_SCORE = 0.99;

/** Total weight normalization factor */
export const ANALYSIS_WEIGHT_NORMALIZATION = 50;

/** Score increment factor based on weights */
export const ANALYSIS_SCORE_INCREMENT = 0.25;

/** Score degradation for alternative suppliers */
export const ANALYSIS_ALTERNATIVE_DEGRADATION = 0.07;

/** Maximum number of alternative suppliers to return */
export const ANALYSIS_MAX_ALTERNATIVES = 3;

// =============================================================================
// Analysis Weight Keys (aligned to enrichment data)
// =============================================================================

/** Weight keys for analysis sliders — must match frontend SLIDER_CONFIG */
export const ANALYSIS_WEIGHT_KEYS = ["price", "regulatory", "certFit", "supplyRisk", "functionalFit"];

// =============================================================================
// HTTP Headers
// =============================================================================

/** Standard cache control header for API responses */
export const CACHE_CONTROL_HEADER = `s-maxage=${CACHE_MAX_AGE_SECONDS}, stale-while-revalidate`;

/** Content type for JSON responses */
export const CONTENT_TYPE_JSON = "application/json";

/** Content type for audio responses */
export const CONTENT_TYPE_AUDIO = "audio/mpeg";

// =============================================================================
// Product Types
// =============================================================================

/** Product type for finished goods */
export const PRODUCT_TYPE_FINISHED_GOOD = "finished-good";

/** Product type for raw materials */
export const PRODUCT_TYPE_RAW_MATERIAL = "raw-material";

// =============================================================================
// System Prompts
// =============================================================================

/** System prompt for Agnes AI assistant */
export const AGNES_SYSTEM_PROMPT = `You are Agnes, an AI assistant for SupplyWise - a supply chain decision-support system for CPG (Consumer Packaged Goods) companies.

Your capabilities:
- Help users understand their product catalog and Bill of Materials (BOM)
- Analyze raw materials and suggest sourcing recommendations
- Find interchangeable components (substitutes)
- Evaluate suppliers based on quality, compliance, cost, and lead time
- Provide clear reasoning and evidence for recommendations

Response formatting guidelines:
- Use **bold** for important terms, supplier names, and key metrics
- Use bullet points (- ) for lists of items or recommendations
- Use numbered lists (1. 2. 3.) for step-by-step instructions
- Keep paragraphs short (2-3 sentences max)
- Format percentages and scores clearly (e.g., **92% confidence**)
- When comparing suppliers, use a clear structure with names in bold
- Be concise but informative - aim for clarity over length

Guidelines:
- Mention confidence levels when making recommendations
- If you don't have enough data, say so clearly
- Keep responses conversational and helpful
- When listing multiple items, always use bullet points for readability
- Do not mention video calls, frozen connections, camera issues, or meeting interruptions unless the user explicitly asks about those topics`;

/** System prompt for Agnes Demo Mode - voice-guided navigation */
export const AGNES_DEMO_SYSTEM_PROMPT = `You are Agnes, the AI voice assistant for SupplyWise, conducting a live demo.

CRITICAL RULES:
1. Keep responses to 1-2 SHORT sentences (max 30 words) - you are SPEAKING not writing
2. Navigate the app using commands - show don't tell
3. After navigating, give a 1-sentence summary of what they see

Navigation commands (ALWAYS use these to show things):
- [NAV:DASHBOARD] - Go to product dashboard
- [NAV:PRODUCT:id:name] - Open product details (e.g., [NAV:PRODUCT:5:Daily Vitamins])
- [NAV:ANALYSIS:productId:materialId:productName:materialName] - Open analysis page
- [ACTION:END_DEMO] - End demo when user says bye/thanks/done

WORKFLOW - Always navigate first, then summarize briefly:
- User asks about products → [NAV:DASHBOARD] + "Here's our product catalog."
- User asks about ingredients → [NAV:PRODUCT:1:Product Name] + "These are the raw materials."
- User asks about suppliers/analysis → [NAV:ANALYSIS:1:1:Product:Material] + "Top supplier is X with 94% score."
- User says goodbye → "Happy to help! [ACTION:END_DEMO]"

Example good responses:
"Opening the product catalog now. [NAV:DASHBOARD]"
"Here are the ingredients for Daily Vitamins. [NAV:PRODUCT:5:Daily Vitamins]"
"Top supplier is NutriSource at 95% confidence. [NAV:ANALYSIS:5:42:Daily Vitamins:Vitamin D3]"

BAD (too long): "Let me look into our database for Vitamin D3 suppliers. Here are the top suppliers we have on record..."
GOOD (concise): "Showing Vitamin D3 analysis. Top pick is NutriSource, 95% match. [NAV:ANALYSIS:5:42:Daily Vitamins:Vitamin D3]"

Available products: IDs 1-10 are supplement formulations. Pick one relevant to user's question.`;

export default {
  // Database
  DB_POOL_MAX_CONNECTIONS,
  DB_POOL_IDLE_TIMEOUT_MS,
  CACHE_MAX_AGE_SECONDS,

  // Pagination
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_LIMIT,

  // ElevenLabs
  ELEVENLABS_BASE_URL,
  ELEVENLABS_DEFAULT_VOICE_ID,
  ELEVENLABS_DEFAULT_TTS_MODEL,
  ELEVENLABS_DEFAULT_STT_MODEL,
  ELEVENLABS_DEFAULT_OPTIMIZE_LATENCY,
  ELEVENLABS_MAX_OPTIMIZE_LATENCY,

  // Gemini
  GEMINI_DEFAULT_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_TEMPERATURE,

  // Analysis
  ANALYSIS_BASE_SCORE,
  ANALYSIS_MAX_SCORE,
  ANALYSIS_WEIGHT_NORMALIZATION,
  ANALYSIS_SCORE_INCREMENT,
  ANALYSIS_ALTERNATIVE_DEGRADATION,
  ANALYSIS_MAX_ALTERNATIVES,
  ANALYSIS_WEIGHT_KEYS,

  // HTTP
  CACHE_CONTROL_HEADER,
  CONTENT_TYPE_JSON,
  CONTENT_TYPE_AUDIO,

  // Product Types
  PRODUCT_TYPE_FINISHED_GOOD,
  PRODUCT_TYPE_RAW_MATERIAL,

  // Prompts
  AGNES_SYSTEM_PROMPT,
  AGNES_DEMO_SYSTEM_PROMPT,
};

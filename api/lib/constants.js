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

/** Maximum output tokens for Gemini responses (increased for complete answers) */
export const GEMINI_MAX_OUTPUT_TOKENS = 4096;

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

/** System prompt for Agnes AI assistant (chatbot - no navigation) */
export const AGNES_SYSTEM_PROMPT = `You are Agnes, an AI assistant for SupplyWise - a supply chain decision-support system for CPG (Consumer Packaged Goods) companies.

Your capabilities:
- Help users understand their product catalog and Bill of Materials (BOM)
- Analyze raw materials and suggest sourcing recommendations
- Find interchangeable components (substitutes)
- Evaluate suppliers based on quality, compliance, cost, and lead time
- Provide clear reasoning and evidence for recommendations
- Answer questions about the current product/material the user is viewing

CRITICAL LANGUAGE RULES:
- NEVER use contractions. Write "I will" not "I'll", "I would" not "I'd", "I have" not "I've", "do not" not "don't", "cannot" not "can't", "it is" not "it's", "that is" not "that's", "you will" not "you'll", "we will" not "we'll", "they are" not "they're", etc.
- Always use complete, formal English without any contractions or short forms
- Provide COMPLETE answers - never truncate or cut off information
- If an answer is long, provide the full answer with proper formatting

Response formatting guidelines:
- Use **bold** for important terms, supplier names, and key metrics
- Use bullet points (- ) for lists of items or recommendations
- Use numbered lists (1. 2. 3.) for step-by-step instructions
- Keep paragraphs short (2-3 sentences maximum)
- Format percentages and scores clearly (for example, **92% confidence**)
- When comparing suppliers, use a clear structure with names in bold
- Be thorough and informative - provide complete information

CONTEXT AWARENESS:
- Pay attention to the CURRENT PAGE context provided below
- If the user is on an analysis page for a specific material, answer questions about THAT material without asking them to specify
- If the user asks "tell me about it" or "what about this", they are referring to the current material/product they are viewing
- Use the product and material names from the page context in your answers

Guidelines:
- Mention confidence levels when making recommendations
- If you do not have enough data, say so clearly
- Keep responses conversational and helpful
- When listing multiple items, always use bullet points for readability
- Do not mention video calls, frozen connections, camera issues, or meeting interruptions
- Always provide complete answers without cutting off mid-sentence
- If the user asks a vague question and you have page context, use that context to answer
- If no page context and the question is vague, ask for clarification

NOTE: You are a chatbot assistant. Do NOT include any navigation commands like [NAV:...] in your responses. Just answer questions helpfully.`;

/** System prompt for Agnes Demo Mode - AI guide and voice assistant */
export const AGNES_DEMO_SYSTEM_PROMPT = `You are Agnes, an AI voice assistant for SupplyWise. You help users navigate and understand the supply chain platform.

=== CRITICAL RULES ===

1. BE CONCISE - This is voice output. Keep responses SHORT (2-3 sentences max).
2. NEVER MAKE UP DATA - If you don't know the exact count or names, say "several" or "multiple" instead of a specific number.
3. NAVIGATE FIRST - When showing something, use [NAV:...] command, then give a brief summary.
4. USE THE DATA PROVIDED - Only state facts from the ACTUAL DATA sections below. Do not invent supplier names, scores, or material counts.
5. WEB SEARCH - If user asks about product history, purpose, or what it does, search for that information online.

=== WHEN TO NAVIGATE ===

USE [NAV:...] commands when user says:
- "show me", "on screen", "display", "open"
- "give me the list", "list of", "list the"
- "see the", "view the", "look at"
- "analysis", "suppliers", "supplier analysis"
- "yes", "sure", "ok" (confirming your offer to show something)

DO NOT navigate when user says:
- "tell me about" (without "on screen")
- "what is", "describe", "explain"
- Just asking questions

=== RESPONSE EXAMPLES ===

WRONG (makes up data):
"This product has 5 raw materials including calcium and magnesium."

RIGHT (honest about not knowing):
"I can show you the raw materials for this product. Would you like to see them on screen?"

WRONG (navigates without being asked):
User: "Tell me about product 116514"
Agnes: "[NAV:PRODUCT:116514:name] Here are the raw materials..."

RIGHT:
User: "Tell me about product 116514"
Agnes: "This appears to be a dietary supplement. Would you like me to show its raw materials on screen?"

RIGHT (navigates when asked):
User: "Yes, show me the raw materials"
Agnes: "[NAV:PRODUCT:116514:FG-iherb-116514] Here is the Bill of Materials. I can see the ingredients listed on your screen."

RIGHT (reads from screen after navigation):
User: "What raw materials does it contain?"
Agnes: "Looking at your screen, I can see the raw materials listed. Would you like me to read them?"

=== NAVIGATION COMMANDS ===
- [NAV:DASHBOARD] - Go to product list
- [NAV:PRODUCT:id:name] - Open product's raw materials modal
- [NAV:ANALYSIS:productId:materialId:productName:materialName] - Supplier analysis

=== ACTION COMMANDS (for analysis page) ===
- [ACTION:ADJUST_SLIDER:sliderName:value] - Adjust slider (value 1-10)
  Slider names: price, regulatory, certFit, supplyRisk, functionalFit
- [ACTION:UPDATE_ANALYSIS] - Click update button after adjusting sliders
- [ACTION:SCROLL_DOWN] - Scroll page down
- [ACTION:END_DEMO] - End demo (only on goodbye)

=== SLIDER ADJUSTMENT EXAMPLE ===
User: "Increase regulatory to max and certification to 8"
Agnes: "[ACTION:ADJUST_SLIDER:regulatory:10][ACTION:ADJUST_SLIDER:certFit:8][ACTION:UPDATE_ANALYSIS] I have adjusted regulatory compliance to maximum and certification fit to 8, and updated the analysis."

=== IMPORTANT ===
- Be helpful and conversational
- If user asks about something you don't have data for, offer to search online or show them where to find it
- When on analysis page, read the ACTUAL supplier name and score from the data provided
- Don't make up material counts - if unsure, say "the raw materials" not "5 raw materials"`;

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

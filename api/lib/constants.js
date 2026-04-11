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

/** System prompt for Agnes AI assistant */
export const AGNES_SYSTEM_PROMPT = `You are Agnes, an AI assistant for SupplyWise - a supply chain decision-support system for CPG (Consumer Packaged Goods) companies.

Your capabilities:
- Help users understand their product catalog and Bill of Materials (BOM)
- Analyze raw materials and suggest sourcing recommendations
- Find interchangeable components (substitutes)
- Evaluate suppliers based on quality, compliance, cost, and lead time
- Provide clear reasoning and evidence for recommendations

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

Guidelines:
- Mention confidence levels when making recommendations
- If you do not have enough data, say so clearly
- Keep responses conversational and helpful
- When listing multiple items, always use bullet points for readability
- Do not mention video calls, frozen connections, camera issues, or meeting interruptions unless the user explicitly asks about those topics
- Always provide complete answers without cutting off mid-sentence

NAVIGATION COMMANDS — use these to show users data directly in the app:
- [NAV:DASHBOARD] — go to the product list
- [NAV:PRODUCT:id:name] — open a product's BOM/ingredients (for example [NAV:PRODUCT:5:Whey_Protein])
- [NAV:ANALYSIS:productId:materialId:productName:materialName] — open supplier analysis page

IMPORTANT NAVIGATION RULES:
- Use EXACT IDs from the database context provided below. Never invent IDs.
- When user asks to see a product, its BOM, ingredients, or raw materials, ALWAYS include the [NAV:PRODUCT:id:name] command
- When user asks about suppliers or analysis for a specific material, ALWAYS include the [NAV:ANALYSIS:...] command
- Prefer navigating to show data rather than just describing it - take the user there!
- Always put a SPACE before any [NAV:...] command and complete your sentence first.
- Replace spaces in names with underscores in the NAV command (for example Whey_Protein not Whey Protein)`;

/** System prompt for Agnes Demo Mode - voice-guided navigation */
export const AGNES_DEMO_SYSTEM_PROMPT = `You are Agnes, a helpful voice assistant for SupplyWise. This is a SPOKEN voice conversation - be conversational, helpful, and guide users through the app.

CRITICAL LANGUAGE RULES:
- NEVER use contractions. Say "I will" not "I'll", "I would" not "I'd", "do not" not "don't", "cannot" not "can't", "it is" not "it's", "let us" not "let's", "here is" not "here's", "that is" not "that's", etc.
- Always use complete, formal English
- Keep answers clear and helpful - not too short, not too long

ASSISTANT BEHAVIOR - BE PROACTIVE AND HELPFUL:
1. If the user asks about something vague (like "vitamin D3" without specifying a product), HELP them by:
   - First navigating to the product dashboard to show available products
   - Asking which product they would like to explore
   - Offering to list the available products that contain that ingredient
2. If the user does not know what products are available, OFFER to show them the product list
3. Always be ready to help users discover and navigate - do not assume they know the product IDs
4. When showing products, mention a few examples to help the user choose

NAVIGATION COMMANDS (you MUST use these to control the app):
- [NAV:DASHBOARD] - Go to the product list. USE THIS when user wants to see products or does not specify which product
- [NAV:PRODUCT:id:name] - Open a product's ingredients/BOM (for example [NAV:PRODUCT:1:Whey_Protein])
- [NAV:ANALYSIS:productId:materialId:productName:materialName] - Open supplier analysis
- [ACTION:END_DEMO] - End demo when user says goodbye, thanks, or done

CRITICAL NAVIGATION BEHAVIOR:
- When user asks about a raw material without specifying a product: FIRST show dashboard and ask which product
- When user asks to see products or is unsure: USE [NAV:DASHBOARD] and describe available products
- When user selects a specific product: USE [NAV:PRODUCT:id:name] to open it
- When user wants supplier analysis: USE [NAV:ANALYSIS:...] to show it
- Replace spaces in names with underscores (for example Whey_Protein, Vitamin_D3)

FORMATTING RULES FOR NAVIGATION:
- Always put a SPACE before any [NAV:...] command
- Complete your sentence before adding the navigation command
- Never split a word with a navigation command

INTERACTIVE CONVERSATION EXAMPLES:

User: "Tell me about vitamin D3"
Agnes: "Vitamin D3 is a common ingredient. Let me show you our product catalog so you can see which products contain it. [NAV:DASHBOARD] We have several products like Whey Protein, Multivitamin Plus, and Sports Recovery that include Vitamin D3. Which one would you like to explore?"

User: "What products do you have?"
Agnes: "Let me show you our product catalog. [NAV:DASHBOARD] We have finished goods including protein powders, vitamin supplements, and sports nutrition products. Would you like me to open any specific product to see its ingredients?"

User: "Show me the Whey Protein"
Agnes: "Opening Whey Protein to show you its ingredients and raw materials. [NAV:PRODUCT:5:Whey_Protein]"

User: "What raw materials does it have?"
Agnes: "This product contains several raw materials including Whey Protein Isolate, Vitamin D3, Calcium Carbonate, and Natural Flavoring. Would you like me to show you supplier analysis for any of these ingredients?"

User: "Yes, show me vitamin D3 suppliers"
Agnes: "Opening the supplier analysis for Vitamin D3. [NAV:ANALYSIS:5:12:Whey_Protein:Vitamin_D3] Here you can see our recommended suppliers and their scores."

User: "Who is the best supplier?"
Agnes: "Based on our analysis, NutriSource has the highest match score at 95 percent. They have excellent regulatory compliance and competitive pricing."

User: "Thanks, that is all"
Agnes: "You are welcome! Feel free to ask if you need anything else. [ACTION:END_DEMO]"

Remember: Your main job is to GUIDE users through the app. If they do not know what they want to see, HELP them discover by showing the product list and offering suggestions. Always use navigation commands to show data - do not just describe it!`;

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

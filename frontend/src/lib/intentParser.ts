/**
 * Intent Parser for Agnes Demo Mode
 * Extracts navigation commands, page actions, and speech from AI responses
 */

import type { ParsedIntent, NavigationTarget } from "@/types/demo";

/**
 * Keywords that BLOCK navigation - user is just asking for information
 * If user says these WITHOUT action words, don't navigate
 */
const INFORMATION_ONLY_PATTERNS = [
  /^what is/i,
  /^what are/i,
  /^tell me about(?! on screen| the screen)/i,  // "tell me about" but NOT "tell me about on screen"
  /^describe/i,
  /^explain/i,
  /^who is/i,
  /^why is/i,
  /^how does/i,
];

/**
 * Keywords that ALLOW navigation - user wants to see something on screen
 */
const NAVIGATION_KEYWORDS = [
  // Direct show/display requests
  "show me",
  "show",
  "on screen",
  "on the screen",
  "display",
  "open",
  "navigate",
  "go to",
  "take me",
  "pull up",
  "bring up",
  // Give/get requests that imply showing
  "give me the list",
  "give me a list",
  "get me the list",
  "list of",
  "list the",
  // See/view requests
  "see the",
  "see it",
  "view the",
  "view it",
  "look at",
  "let me see",
  "i want to see",
  "i would like to see",
  "i'd like to see",
  // Analysis requests
  "analysis",
  "analyze",
  "supplier",
  "suppliers",
  // Confirmations (when Agnes asks "would you like me to show...")
  "yes",
  "yeah",
  "yep",
  "sure",
  "ok",
  "okay",
  "please",
  "go ahead",
  "do it",
];

/**
 * Check if user's message is asking for information only (no navigation)
 */
function isInformationOnlyRequest(userMessage: string): boolean {
  const lower = userMessage.toLowerCase().trim();
  return INFORMATION_ONLY_PATTERNS.some(pattern => pattern.test(lower));
}

/**
 * Check if user's message contains navigation intent
 */
export function userRequestedNavigation(userMessage: string): boolean {
  const lower = userMessage.toLowerCase();

  // If it matches information-only pattern AND doesn't have explicit screen/show words, block navigation
  if (isInformationOnlyRequest(lower)) {
    const hasExplicitShowWord = ["show", "screen", "display", "open", "view", "see"].some(w => lower.includes(w));
    if (!hasExplicitShowWord) {
      console.log("[IntentParser] Information-only request detected, blocking navigation");
      return false;
    }
  }

  const hasKeyword = NAVIGATION_KEYWORDS.some(keyword => lower.includes(keyword));
  console.log("[IntentParser] Navigation check:", {
    hasKeyword,
    matchedKeyword: NAVIGATION_KEYWORDS.find(k => lower.includes(k))
  });
  return hasKeyword;
}

/**
 * Parse navigation command from AI response
 * Formats:
 * - [NAV:DASHBOARD]
 * - [NAV:PRODUCT:id:name]
 * - [NAV:ANALYSIS:productId:materialId:productName:materialName]
 * - [HIGHLIGHT:selector]
 * - [ACTION:END_DEMO]
 * - [ACTION:ADJUST_SLIDER:sliderName:value]
 * - [ACTION:SCROLL_DOWN]
 * - [ACTION:UPDATE_ANALYSIS]
 *
 * @param response - AI response text
 * @param userMessage - Optional: user's original message. If provided, navigation
 *                      commands will be STRIPPED unless user explicitly requested navigation
 */
export function parseIntent(response: string, userMessage?: string): ParsedIntent {
  // SAFEGUARD: If we have the user's message, check if they actually requested navigation
  // If not, strip any [NAV:...] commands from the response before parsing
  let sanitizedResponse = response;

  if (userMessage && !userRequestedNavigation(userMessage)) {
    // User did NOT request navigation - strip all NAV commands
    sanitizedResponse = response
      .replace(/\[NAV:DASHBOARD\]/gi, "")
      .replace(/\[NAV:PRODUCT:\d+:[^\]]+\]/gi, "")
      .replace(/\[NAV:ANALYSIS:\d+:\d+:[^:]+:[^\]]+\]/gi, "");

    if (sanitizedResponse !== response) {
      console.log("[IntentParser] Stripped unauthorized navigation from AI response");
      console.log("[IntentParser] User said:", userMessage);
    }
  }
  let speech = sanitizedResponse;
  let navigation: NavigationTarget | undefined;
  let highlight: string | undefined;
  let action: ParsedIntent["action"];
  let actionParams: Record<string, unknown> | undefined;

  // Parse navigation commands (from sanitized response)
  const navDashboard = sanitizedResponse.match(/\[NAV:DASHBOARD\]/i);
  const navProduct = sanitizedResponse.match(/\[NAV:PRODUCT:(\d+):([^\]]+)\]/i);
  const navAnalysis = sanitizedResponse.match(
    /\[NAV:ANALYSIS:(\d+):(\d+):([^:]+):([^\]]+)\]/i
  );

  if (navDashboard) {
    navigation = { type: "DASHBOARD" };
    speech = speech.replace(navDashboard[0], "");
  } else if (navProduct) {
    navigation = {
      type: "PRODUCT",
      productId: parseInt(navProduct[1], 10),
      productName: navProduct[2].trim(),
    };
    speech = speech.replace(navProduct[0], "");
  } else if (navAnalysis) {
    navigation = {
      type: "ANALYSIS",
      productId: parseInt(navAnalysis[1], 10),
      materialId: parseInt(navAnalysis[2], 10),
      productName: navAnalysis[3].trim(),
      materialName: navAnalysis[4].trim(),
    };
    speech = speech.replace(navAnalysis[0], "");
  }

  // Parse highlight command
  const highlightMatch = sanitizedResponse.match(/\[HIGHLIGHT:([^\]]+)\]/i);
  if (highlightMatch) {
    highlight = highlightMatch[1].trim();
    speech = speech.replace(highlightMatch[0], "");
  }

  // Parse action commands
  // [ACTION:ADJUST_SLIDER:price:10]
  const sliderMatch = sanitizedResponse.match(/\[ACTION:ADJUST_SLIDER:(\w+):(\d+)\]/i);
  if (sliderMatch) {
    action = "ADJUST_SLIDER";
    actionParams = {
      slider: sliderMatch[1],
      value: parseInt(sliderMatch[2], 10),
    };
    speech = speech.replace(sliderMatch[0], "");
  }

  // [ACTION:SET_SLIDERS:price=10,regulatory=8,certFit=9]
  const multiSliderMatch = sanitizedResponse.match(/\[ACTION:SET_SLIDERS:([^\]]+)\]/i);
  if (multiSliderMatch) {
    action = "SET_ALL_SLIDERS";
    const slidersStr = multiSliderMatch[1];
    const sliders: Record<string, number> = {};
    slidersStr.split(",").forEach(pair => {
      const [name, val] = pair.split("=");
      if (name && val) {
        sliders[name.trim()] = parseInt(val.trim(), 10);
      }
    });
    actionParams = { sliders };
    speech = speech.replace(multiSliderMatch[0], "");
  }

  // [ACTION:MAXIMIZE:price] or [ACTION:MINIMIZE:price]
  const maxMinMatch = sanitizedResponse.match(/\[ACTION:(MAXIMIZE|MINIMIZE):(\w+)\]/i);
  if (maxMinMatch) {
    action = maxMinMatch[1].toUpperCase() === "MAXIMIZE" ? "MAXIMIZE_SLIDER" : "MINIMIZE_SLIDER";
    actionParams = { slider: maxMinMatch[2] };
    speech = speech.replace(maxMinMatch[0], "");
  }

  // Simple actions
  const simpleActionMatch = sanitizedResponse.match(/\[ACTION:(SCROLL_DOWN|SCROLL_UP|SCROLL_TO_TOP|SCROLL_TO_BOTTOM|UPDATE_ANALYSIS)\]/i);
  if (simpleActionMatch) {
    action = simpleActionMatch[1].toUpperCase() as ParsedIntent["action"];
    speech = speech.replace(simpleActionMatch[0], "");
  }

  // [ACTION:END_DEMO]
  const endMatch = sanitizedResponse.match(/\[ACTION:END_DEMO\]/i);
  if (endMatch) {
    action = "END_DEMO";
    speech = speech.replace(endMatch[0], "");
  }

  // Clean up speech - remove extra whitespace and markdown
  speech = cleanSpeechText(speech);

  return {
    speech,
    navigation,
    highlight,
    action,
    actionParams,
  };
}

/**
 * Clean text for TTS output
 * Removes markdown, extra whitespace, and formats for natural speech
 */
export function cleanSpeechText(text: string): string {
  return (
    text
      // Remove markdown bold
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      // Remove markdown italic
      .replace(/\*([^*]+)\*/g, "$1")
      // Remove markdown code
      .replace(/`([^`]+)`/g, "$1")
      // Remove markdown links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove bullet points
      .replace(/^[-•]\s+/gm, "")
      // Remove numbered lists
      .replace(/^\d+\.\s+/gm, "")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      // Remove leading/trailing whitespace
      .trim()
  );
}

/**
 * Check if a response indicates the demo should end
 */
export function shouldEndDemo(intent: ParsedIntent): boolean {
  return intent.action === "END_DEMO";
}

/**
 * Check if a response requires navigation
 */
export function hasNavigation(intent: ParsedIntent): boolean {
  return intent.navigation !== undefined;
}

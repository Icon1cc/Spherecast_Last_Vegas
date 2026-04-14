/**
 * Intent Parser for Agnes Demo Mode
 * Extracts navigation commands, page actions, and speech from AI responses
 */

import type { ParsedIntent, NavigationTarget } from "@/types/demo";

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
 */
export function parseIntent(response: string): ParsedIntent {
  let speech = response;
  let navigation: NavigationTarget | undefined;
  let highlight: string | undefined;
  let action: ParsedIntent["action"];
  let actionParams: Record<string, unknown> | undefined;

  // Parse navigation commands
  const navDashboard = response.match(/\[NAV:DASHBOARD\]/i);
  const navProduct = response.match(/\[NAV:PRODUCT:(\d+):([^\]]+)\]/i);
  const navAnalysis = response.match(
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
  const highlightMatch = response.match(/\[HIGHLIGHT:([^\]]+)\]/i);
  if (highlightMatch) {
    highlight = highlightMatch[1].trim();
    speech = speech.replace(highlightMatch[0], "");
  }

  // Parse action commands
  // [ACTION:ADJUST_SLIDER:price:10]
  const sliderMatch = response.match(/\[ACTION:ADJUST_SLIDER:(\w+):(\d+)\]/i);
  if (sliderMatch) {
    action = "ADJUST_SLIDER";
    actionParams = {
      slider: sliderMatch[1],
      value: parseInt(sliderMatch[2], 10),
    };
    speech = speech.replace(sliderMatch[0], "");
  }

  // [ACTION:SET_SLIDERS:price=10,regulatory=8,certFit=9]
  const multiSliderMatch = response.match(/\[ACTION:SET_SLIDERS:([^\]]+)\]/i);
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
  const maxMinMatch = response.match(/\[ACTION:(MAXIMIZE|MINIMIZE):(\w+)\]/i);
  if (maxMinMatch) {
    action = maxMinMatch[1].toUpperCase() === "MAXIMIZE" ? "MAXIMIZE_SLIDER" : "MINIMIZE_SLIDER";
    actionParams = { slider: maxMinMatch[2] };
    speech = speech.replace(maxMinMatch[0], "");
  }

  // Simple actions
  const simpleActionMatch = response.match(/\[ACTION:(SCROLL_DOWN|SCROLL_UP|SCROLL_TO_TOP|SCROLL_TO_BOTTOM|UPDATE_ANALYSIS)\]/i);
  if (simpleActionMatch) {
    action = simpleActionMatch[1].toUpperCase() as ParsedIntent["action"];
    speech = speech.replace(simpleActionMatch[0], "");
  }

  // [ACTION:END_DEMO]
  const endMatch = response.match(/\[ACTION:END_DEMO\]/i);
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

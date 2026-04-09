/**
 * Intent Parser for Agnes Demo Mode
 * Extracts navigation commands and actions from AI responses
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
 */
export function parseIntent(response: string): ParsedIntent {
  let speech = response;
  let navigation: NavigationTarget | undefined;
  let highlight: string | undefined;
  let action: ParsedIntent["action"];

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

  // Parse action command
  const actionMatch = response.match(/\[ACTION:(\w+)\]/i);
  if (actionMatch) {
    const actionType = actionMatch[1].toUpperCase();
    if (actionType === "END_DEMO") {
      action = "END_DEMO";
    } else if (actionType === "SHOW_PRODUCTS") {
      action = "SHOW_PRODUCTS";
    } else if (actionType === "CONTINUE") {
      action = "CONTINUE";
    }
    speech = speech.replace(actionMatch[0], "");
  }

  // Clean up speech - remove extra whitespace and markdown
  speech = cleanSpeechText(speech);

  return {
    speech,
    navigation,
    highlight,
    action,
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

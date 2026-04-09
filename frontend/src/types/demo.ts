/**
 * Jarvis Demo Mode Types
 */

export type DemoPhase =
  | "IDLE"
  | "GREETING"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "NAVIGATING"
  | "COMPLETE";

export interface TranscriptEntry {
  id: string;
  role: "user" | "jarvis";
  text: string;
  timestamp: Date;
}

export interface NavigationTarget {
  type: "DASHBOARD" | "PRODUCT" | "MATERIAL" | "ANALYSIS";
  productId?: number;
  materialId?: number;
  productName?: string;
  materialName?: string;
}

export interface ParsedIntent {
  speech: string;
  navigation?: NavigationTarget;
  highlight?: string;
  action?: "END_DEMO" | "SHOW_PRODUCTS" | "CONTINUE";
}

export interface DemoState {
  phase: DemoPhase;
  transcript: TranscriptEntry[];
  currentSpeech: string;
  isInterrupted: boolean;
  navigationTarget: NavigationTarget | null;
  highlightedElement: string | null;
  error: string | null;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}

export type DemoAction =
  | { type: "START_DEMO" }
  | { type: "GREETING_COMPLETE" }
  | { type: "START_LISTENING" }
  | { type: "USER_SPOKE"; payload: string }
  | { type: "AI_THINKING" }
  | { type: "AI_RESPONSE"; payload: ParsedIntent }
  | { type: "SPEECH_START"; payload: string }
  | { type: "SPEECH_COMPLETE" }
  | { type: "NAVIGATE"; payload: NavigationTarget }
  | { type: "NAVIGATION_COMPLETE" }
  | { type: "INTERRUPT" }
  | { type: "ERROR"; payload: string }
  | { type: "CLOSE_DEMO" }
  | { type: "RESET" };

export interface VoiceIOState {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
}

export interface VoiceIOControls {
  startListening: () => Promise<void>;
  stopListening: () => void;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
}

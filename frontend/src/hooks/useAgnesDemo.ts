/**
 * useAgnesDemo - State machine for Agnes Demo Mode
 * Orchestrates voice I/O, AI conversation, and navigation
 */

import { useReducer, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useVoiceIO } from "./useVoiceIO";
import { parseIntent, shouldEndDemo, hasNavigation } from "@/lib/intentParser";
import type { DemoState, DemoAction, DemoPhase, TranscriptEntry, NavigationTarget } from "@/types/demo";

const AGNES_GREETING = "Hello, I'm Agnes, your AI supply chain assistant. What would you like to explore today?";

const initialState: DemoState = {
  phase: "IDLE",
  transcript: [],
  currentSpeech: "",
  isInterrupted: false,
  navigationTarget: null,
  highlightedElement: null,
  error: null,
  conversationHistory: [],
};

function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "START_DEMO":
      return {
        ...initialState,
        phase: "GREETING",
        transcript: [],
        conversationHistory: [],
      };

    case "GREETING_COMPLETE":
      return {
        ...state,
        phase: "LISTENING",
      };

    case "START_LISTENING":
      return {
        ...state,
        phase: "LISTENING",
        isInterrupted: false,
      };

    case "USER_SPOKE":
      return {
        ...state,
        phase: "THINKING",
        transcript: [
          ...state.transcript,
          {
            id: crypto.randomUUID(),
            role: "user",
            text: action.payload,
            timestamp: new Date(),
          },
        ],
        conversationHistory: [
          ...state.conversationHistory,
          { role: "user", content: action.payload },
        ],
      };

    case "AI_THINKING":
      return {
        ...state,
        phase: "THINKING",
      };

    case "AI_RESPONSE":
      const newTranscript: TranscriptEntry = {
        id: crypto.randomUUID(),
        role: "agnes",
        text: action.payload.speech,
        timestamp: new Date(),
      };
      return {
        ...state,
        phase: action.payload.navigation ? "SPEAKING" : "SPEAKING",
        currentSpeech: action.payload.speech,
        transcript: [...state.transcript, newTranscript],
        navigationTarget: action.payload.navigation ?? null,
        conversationHistory: [
          ...state.conversationHistory,
          { role: "assistant", content: action.payload.speech },
        ],
      };

    case "SPEECH_START":
      return {
        ...state,
        phase: "SPEAKING",
        currentSpeech: action.payload,
      };

    case "SPEECH_COMPLETE":
      // If there's a pending navigation, go to NAVIGATING
      if (state.navigationTarget) {
        return {
          ...state,
          phase: "NAVIGATING",
        };
      }
      // Otherwise go back to listening
      return {
        ...state,
        phase: "LISTENING",
        currentSpeech: "",
      };

    case "NAVIGATE":
      return {
        ...state,
        phase: "NAVIGATING",
        navigationTarget: action.payload,
      };

    case "NAVIGATION_COMPLETE":
      return {
        ...state,
        phase: "LISTENING",
        navigationTarget: null,
        highlightedElement: null,
      };

    case "INTERRUPT":
      return {
        ...state,
        phase: "LISTENING",
        isInterrupted: true,
        currentSpeech: "",
      };

    case "ERROR":
      return {
        ...state,
        error: action.payload,
        // Don't change phase on error, let the hook handle recovery
      };

    case "CLOSE_DEMO":
      return {
        ...initialState,
        phase: "IDLE",
      };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

interface UseAgnesDemoOptions {
  onNavigate?: (target: NavigationTarget) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export interface UseAgnesDemoReturn {
  state: DemoState;
  phase: DemoPhase;
  transcript: TranscriptEntry[];
  currentSpeech: string;
  isActive: boolean;
  startDemo: () => void;
  closeDemo: () => void;
  interrupt: () => void;
}

export function useAgnesDemo(options: UseAgnesDemoOptions = {}): UseAgnesDemoReturn {
  const [state, dispatch] = useReducer(demoReducer, initialState);
  const navigate = useNavigate();
  const location = useLocation();
  const isProcessingRef = useRef(false);
  const pendingNavigationRef = useRef<NavigationTarget | null>(null);

  // Voice I/O setup
  const voiceIO = useVoiceIO({
    onTranscript: useCallback((text: string) => {
      dispatch({ type: "USER_SPOKE", payload: text });
    }, []),
    onSpeechStart: useCallback(() => {
      // Speech started
    }, []),
    onSpeechEnd: useCallback(() => {
      dispatch({ type: "SPEECH_COMPLETE" });
    }, []),
    onListeningStart: useCallback(() => {
      // Listening started
    }, []),
    onListeningEnd: useCallback(() => {
      // Listening ended
    }, []),
    onError: useCallback((error: Error, context: string) => {
      console.error(`Voice error (${context}):`, error);
      dispatch({ type: "ERROR", payload: error.message });
      options.onError?.(error.message);
    }, [options]),
  });

  /**
   * Send message to AI and get response
   */
  const sendToAI = useCallback(async (message: string, history: Array<{ role: "user" | "assistant"; content: string }>) => {
    const response = await fetch("/api/chat/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, isDemo: true }),
    });

    if (!response.ok) {
      // Fallback to regular chat endpoint
      const fallbackResponse = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      if (!fallbackResponse.ok) {
        throw new Error("Failed to get AI response");
      }
      const data = await fallbackResponse.json();
      return data.response as string;
    }

    const data = await response.json();
    return data.response as string;
  }, []);

  /**
   * Execute navigation
   */
  const executeNavigation = useCallback(async (target: NavigationTarget) => {
    options.onNavigate?.(target);

    switch (target.type) {
      case "DASHBOARD":
        navigate("/");
        break;
      case "PRODUCT":
        // Navigate to dashboard and we'll handle product selection via highlight
        if (location.pathname !== "/") {
          navigate("/");
        }
        break;
      case "ANALYSIS":
        const params = new URLSearchParams({
          product: target.productName || "Product",
          material: target.materialName || "Material",
        });
        navigate(`/analysis/${target.productId}/${target.materialId}?${params}`);
        break;
    }

    // Wait for navigation to settle
    await new Promise(resolve => setTimeout(resolve, 800));
    dispatch({ type: "NAVIGATION_COMPLETE" });
  }, [navigate, location.pathname, options]);

  /**
   * Process AI response and handle actions
   */
  const processAIResponse = useCallback(async (response: string) => {
    const intent = parseIntent(response);

    // Dispatch the response
    dispatch({ type: "AI_RESPONSE", payload: intent });

    // Check if demo should end
    if (shouldEndDemo(intent)) {
      await voiceIO.speak(intent.speech);
      dispatch({ type: "CLOSE_DEMO" });
      options.onComplete?.();
      return;
    }

    // Speak the response
    await voiceIO.speak(intent.speech);

    // Handle navigation after speech
    if (hasNavigation(intent) && intent.navigation) {
      pendingNavigationRef.current = intent.navigation;
    }
  }, [voiceIO, options]);

  // Effect: Handle GREETING phase
  useEffect(() => {
    if (state.phase !== "GREETING") return;

    const doGreeting = async () => {
      await voiceIO.speak(AGNES_GREETING);
      dispatch({ type: "GREETING_COMPLETE" });
    };

    void doGreeting();
  }, [state.phase, voiceIO]);

  // Effect: Handle LISTENING phase
  useEffect(() => {
    if (state.phase !== "LISTENING") return;

    // Small delay before starting to listen
    const timer = setTimeout(() => {
      if (state.phase === "LISTENING") {
        void voiceIO.startListening();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [state.phase, voiceIO]);

  // Effect: Handle THINKING phase - send to AI
  useEffect(() => {
    if (state.phase !== "THINKING" || isProcessingRef.current) return;

    const lastUserMessage = state.transcript.filter(t => t.role === "user").pop();
    if (!lastUserMessage) return;

    isProcessingRef.current = true;

    const process = async () => {
      try {
        const response = await sendToAI(lastUserMessage.text, state.conversationHistory.slice(0, -1));
        await processAIResponse(response);
      } catch (error) {
        console.error("AI processing error:", error);
        dispatch({ type: "ERROR", payload: "I encountered an issue. Let me try again." });
        // Recover by going back to listening
        await voiceIO.speak("I had a small hiccup. Could you repeat that?");
        dispatch({ type: "START_LISTENING" });
      } finally {
        isProcessingRef.current = false;
      }
    };

    void process();
  }, [state.phase, state.transcript, state.conversationHistory, sendToAI, processAIResponse, voiceIO]);

  // Effect: Handle NAVIGATING phase
  useEffect(() => {
    if (state.phase !== "NAVIGATING" || !state.navigationTarget) return;

    void executeNavigation(state.navigationTarget);
  }, [state.phase, state.navigationTarget, executeNavigation]);

  // Effect: Handle pending navigation after speech complete
  useEffect(() => {
    if (state.phase === "LISTENING" && pendingNavigationRef.current) {
      const nav = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      dispatch({ type: "NAVIGATE", payload: nav });
    }
  }, [state.phase]);

  /**
   * Start the demo
   */
  const startDemo = useCallback(() => {
    dispatch({ type: "START_DEMO" });
  }, []);

  /**
   * Close/end the demo
   */
  const closeDemo = useCallback(() => {
    voiceIO.stopSpeaking();
    voiceIO.stopListening();
    dispatch({ type: "CLOSE_DEMO" });
  }, [voiceIO]);

  /**
   * Interrupt current speech and start listening
   */
  const interrupt = useCallback(() => {
    voiceIO.stopSpeaking();
    dispatch({ type: "INTERRUPT" });
    void voiceIO.startListening();
  }, [voiceIO]);

  return {
    state,
    phase: state.phase,
    transcript: state.transcript,
    currentSpeech: state.currentSpeech,
    isActive: state.phase !== "IDLE",
    startDemo,
    closeDemo,
    interrupt,
  };
}

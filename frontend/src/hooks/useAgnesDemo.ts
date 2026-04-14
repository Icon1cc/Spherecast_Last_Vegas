/**
 * useAgnesDemo - State machine for Agnes Demo Mode
 * Orchestrates voice I/O, AI conversation, and navigation
 */

import { useReducer, useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useVoiceIO } from "./useVoiceIO";
import { parseIntent, shouldEndDemo, hasNavigation } from "@/lib/intentParser";
import { getComponentAnalysis, type AnalysisResponse, type AnalysisWeights } from "@/lib/api";
import type { DemoState, DemoAction, DemoPhase, TranscriptEntry, NavigationTarget } from "@/types/demo";
import type { PageContext } from "@/lib/api";

const AGNES_GREETING = "Hi, I am Agnes, your AI guide for SupplyWise. I can help you explore products, explain raw materials, find the best suppliers, and answer your questions. What would you like to know?";

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

    case "AI_RESPONSE": {
      const newTranscript: TranscriptEntry = {
        id: crypto.randomUUID(),
        role: "agnes",
        text: action.payload.speech,
        timestamp: new Date(),
      };
      return {
        ...state,
        phase: "SPEAKING",
        currentSpeech: action.payload.speech,
        transcript: [...state.transcript, newTranscript],
        // IMPORTANT: Always clear navigationTarget - navigation is done BEFORE this dispatch
        navigationTarget: null,
        conversationHistory: [
          ...state.conversationHistory,
          { role: "assistant", content: action.payload.speech },
        ],
      };
    }

    case "SPEECH_START":
      return {
        ...state,
        phase: "SPEAKING",
        currentSpeech: action.payload,
      };

    case "SPEECH_COMPLETE":
      // Navigation is now done BEFORE speaking, so always go to LISTENING
      return {
        ...state,
        phase: "LISTENING",
        currentSpeech: "",
        navigationTarget: null,
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
  const noSpeechRetryCountRef = useRef(0);
  const MAX_NO_SPEECH_RETRIES = 3;

  // State for analysis page data
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);

  // Derive page context from current URL so Agnes knows what product/material is being viewed
  const pageContext = useMemo((): PageContext | null => {
    const match = location.pathname.match(/^\/analysis\/(\d+)\/(\d+)/);
    if (match) {
      const sp = new URLSearchParams(location.search);
      return {
        productId: match[1],
        materialId: match[2],
        productName: sp.get("product") ?? undefined,
        materialName: sp.get("material") ?? undefined,
      };
    }
    const productMatch = location.pathname.match(/^\/product\/(\d+)/);
    if (productMatch) {
      const sp = new URLSearchParams(location.search);
      return { productId: productMatch[1], productName: sp.get("product") ?? undefined };
    }
    return null;
  }, [location.pathname, location.search]);

  // Fetch analysis data when on analysis page
  useEffect(() => {
    if (pageContext?.materialId) {
      const materialId = parseInt(pageContext.materialId, 10);
      const defaultWeights: AnalysisWeights = {
        price: 5,
        regulatory: 5,
        certFit: 5,
        supplyRisk: 5,
        functionalFit: 5,
      };

      console.log("[Agnes] Fetching analysis data for material:", materialId);
      getComponentAnalysis(materialId, defaultWeights)
        .then((data) => {
          console.log("[Agnes] Analysis data loaded:", {
            supplier: data.recommendedSupplier?.name,
            score: data.recommendedSupplier?.score,
            country: data.recommendedSupplier?.country,
            alternatives: data.alternatives?.length,
          });
          setAnalysisData(data);
        })
        .catch((err) => {
          console.error("[Agnes] Failed to fetch analysis data:", err);
          setAnalysisData(null);
        });
    } else {
      setAnalysisData(null);
    }
  }, [pageContext?.materialId]);

  // Voice I/O setup
  const voiceIO = useVoiceIO({
    onTranscript: useCallback((text: string) => {
      console.log("[Agnes] Got transcript:", text);
      noSpeechRetryCountRef.current = 0;
      dispatch({ type: "USER_SPOKE", payload: text });
    }, []),
    onSpeechStart: useCallback(() => {
      console.log("[Agnes] TTS started");
    }, []),
    onSpeechEnd: useCallback(() => {
      console.log("[Agnes] TTS ended, dispatching SPEECH_COMPLETE");
      dispatch({ type: "SPEECH_COMPLETE" });
    }, []),
    onListeningStart: useCallback(() => {
      console.log("[Agnes] Microphone listening started");
    }, []),
    onListeningEnd: useCallback(() => {
      console.log("[Agnes] Microphone listening ended");
    }, []),
    onError: useCallback((error: Error, context: string) => {
      console.error(`[Agnes] Voice error (${context}):`, error.message);

      // Handle STT errors - just restart listening
      if (context === "stt") {
        console.log("[Agnes] STT error, restarting listening...");
        dispatch({ type: "START_LISTENING" });
        return;
      }

      dispatch({ type: "ERROR", payload: error.message });
      options.onError?.(error.message);
    }, [options]),
  });

  /**
   * Send message to AI and get response
   */
  const sendToAI = useCallback(async (message: string, history: Array<{ role: "user" | "assistant"; content: string }>) => {
    // Build extended page context with analysis data if available
    const extendedPageContext = pageContext ? {
      ...pageContext,
      // Include actual analysis data when on analysis page
      analysisData: analysisData ? {
        componentName: analysisData.component?.name,
        recommendedSupplier: {
          name: analysisData.recommendedSupplier?.name,
          score: analysisData.recommendedSupplier?.score,
          country: analysisData.recommendedSupplier?.country,
          price: analysisData.recommendedSupplier?.price,
          priceUnit: analysisData.recommendedSupplier?.priceUnit,
          priceCurrency: analysisData.recommendedSupplier?.priceCurrency,
          reasoning: analysisData.recommendedSupplier?.reasoning,
        },
        alternatives: analysisData.alternatives?.slice(0, 3).map(alt => ({
          name: alt.name,
          score: alt.score,
          country: alt.country,
          reasoning: alt.reasoning,
        })),
        supplierCount: analysisData.supplierCount,
      } : undefined,
    } : null;

    // Log what we're sending to help debug
    console.log("[Agnes] Sending to AI with context:", {
      hasPageContext: !!pageContext,
      hasAnalysisData: !!analysisData,
      supplierName: analysisData?.recommendedSupplier?.name,
      materialId: pageContext?.materialId,
    });

    // Use the main chat endpoint with isDemo flag - this uses the demo system prompt
    const response = await fetch("/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history,
        isDemo: true,
        pageContext: extendedPageContext,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get AI response");
    }

    const data = await response.json();
    return data.response as string;
  }, [pageContext, analysisData]);

  /**
   * Execute navigation
   */
  const executeNavigation = useCallback(async (target: NavigationTarget) => {
    options.onNavigate?.(target);
    console.log("[Agnes] Executing navigation:", target);

    switch (target.type) {
      case "DASHBOARD":
        navigate("/");
        break;
      case "PRODUCT": {
        // Navigate to dashboard with product param to auto-open the BOM modal
        const productParams = new URLSearchParams();
        if (target.productId) productParams.set("product", String(target.productId));
        if (target.productName) productParams.set("name", target.productName);
        navigate(`/?${productParams.toString()}`);
        break;
      }
      case "ANALYSIS": {
        const analysisParams = new URLSearchParams({
          product: target.productName || "Product",
          material: target.materialName || "Material",
        });
        navigate(`/analysis/${target.productId}/${target.materialId}?${analysisParams}`);
        break;
      }
    }

    // Wait for navigation to settle
    await new Promise(resolve => setTimeout(resolve, 400));
  }, [navigate, options]);

  /**
   * Execute page actions (adjust sliders, scroll, click buttons)
   */
  const executePageAction = useCallback(async (action: string, params?: Record<string, unknown>) => {
    console.log("[Agnes] Executing page action:", action, params);

    switch (action) {
      case "ADJUST_SLIDER": {
        // Adjust a slider on the analysis page
        const sliderName = params?.slider as string;
        const value = params?.value as number;
        if (!sliderName || value === undefined) {
          console.warn("[Agnes] Missing slider name or value:", params);
          return;
        }

        // Map slider names to their IDs (handle various formats)
        const sliderMap: Record<string, string> = {
          "price": "slider-price",
          "cost": "slider-price",
          "regulatory": "slider-regulatory",
          "compliance": "slider-regulatory",
          "certfit": "slider-certFit",
          "certification": "slider-certFit",
          "cert": "slider-certFit",
          "supplyrisk": "slider-supplyRisk",
          "supply": "slider-supplyRisk",
          "risk": "slider-supplyRisk",
          "functionalfit": "slider-functionalFit",
          "functional": "slider-functionalFit",
          "function": "slider-functionalFit",
        };

        const normalizedName = sliderName.toLowerCase().replace(/[\s_-]+/g, "");
        const sliderId = sliderMap[normalizedName];

        if (sliderId) {
          const slider = document.getElementById(sliderId) as HTMLInputElement;
          if (slider) {
            // Clamp value between 1 and 10
            const clampedValue = Math.max(1, Math.min(10, value));
            slider.value = String(clampedValue);
            slider.dispatchEvent(new Event("input", { bubbles: true }));
            slider.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("[Agnes] Adjusted slider:", sliderId, "to", clampedValue);
          } else {
            console.warn("[Agnes] Slider element not found:", sliderId);
          }
        } else {
          console.warn("[Agnes] Unknown slider name:", sliderName, "normalized:", normalizedName);
        }
        break;
      }

      case "SCROLL_DOWN": {
        window.scrollBy({ top: 400, behavior: "smooth" });
        break;
      }

      case "SCROLL_UP": {
        window.scrollBy({ top: -400, behavior: "smooth" });
        break;
      }

      case "SCROLL_TO_TOP": {
        window.scrollTo({ top: 0, behavior: "smooth" });
        break;
      }

      case "SCROLL_TO_BOTTOM": {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        break;
      }

      case "UPDATE_ANALYSIS": {
        // Click the "Update Analysis" button - use valid selector
        const buttons = document.querySelectorAll("button");
        const updateBtn = Array.from(buttons).find(
          btn => btn.textContent?.toLowerCase().includes("update")
        );
        if (updateBtn) {
          (updateBtn as HTMLButtonElement).click();
          console.log("[Agnes] Clicked Update Analysis button");
          // Wait for analysis to update
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.warn("[Agnes] Update Analysis button not found");
        }
        break;
      }

      case "SET_ALL_SLIDERS": {
        // Set multiple sliders at once
        const sliders = params?.sliders as Record<string, number>;
        if (!sliders) return;

        for (const [name, value] of Object.entries(sliders)) {
          await executePageAction("ADJUST_SLIDER", { slider: name, value });
          await new Promise(r => setTimeout(r, 150));
        }
        // Auto-click update after setting sliders
        await executePageAction("UPDATE_ANALYSIS", {});
        break;
      }

      case "MAXIMIZE_SLIDER": {
        const sliderName = params?.slider as string;
        if (sliderName) {
          await executePageAction("ADJUST_SLIDER", { slider: sliderName, value: 10 });
        }
        break;
      }

      case "MINIMIZE_SLIDER": {
        const sliderName = params?.slider as string;
        if (sliderName) {
          await executePageAction("ADJUST_SLIDER", { slider: sliderName, value: 1 });
        }
        break;
      }
    }

    // Small delay after action
    await new Promise(resolve => setTimeout(resolve, 200));
  }, []);

  /**
   * Process AI response and handle actions
   * IMPORTANT: Navigate FIRST, then speak (so user sees page while Agnes explains)
   * @param response - AI response text
   * @param userMessage - The user's original message (used to validate navigation)
   */
  const processAIResponse = useCallback(async (response: string, userMessage: string) => {
    console.log("[Agnes] Processing AI response:", {
      responsePreview: response.substring(0, 100),
      hasNavCommand: response.includes("[NAV:"),
      userMessage: userMessage.substring(0, 50),
    });

    // Pass userMessage to parseIntent - it will strip navigation if user didn't request it
    const intent = parseIntent(response, userMessage);

    console.log("[Agnes] Parsed intent:", {
      hasNavigation: !!intent.navigation,
      navigationType: intent.navigation?.type,
      action: intent.action,
      actionsCount: intent.actions?.length || 0,
    });

    // Check if demo should end
    if (shouldEndDemo(intent)) {
      dispatch({ type: "AI_RESPONSE", payload: intent });
      await voiceIO.speak(intent.speech);
      dispatch({ type: "CLOSE_DEMO" });
      options.onComplete?.();
      return;
    }

    // NAVIGATE FIRST (before speaking) so user sees the page while Agnes explains
    if (hasNavigation(intent) && intent.navigation) {
      console.log("[Agnes] Navigating FIRST:", intent.navigation);
      await executeNavigation(intent.navigation);
      // Small delay for page to render
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.log("[Agnes] No navigation in intent");
    }

    // Execute ALL page actions (supports multiple slider adjustments)
    if (intent.actions && intent.actions.length > 0) {
      console.log("[Agnes] Executing", intent.actions.length, "actions");
      for (const act of intent.actions) {
        await executePageAction(act.action, act.params);
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between actions
      }
    } else if (intent.action && intent.action !== "END_DEMO") {
      // Fallback for single action (backward compatibility)
      await executePageAction(intent.action, intent.actionParams);
    }

    // Clear navigation from intent BEFORE dispatching - we already navigated
    const intentWithoutNav = { ...intent, navigation: undefined };

    // Dispatch the response (updates transcript) - navigation is cleared so we go to LISTENING after speech
    dispatch({ type: "AI_RESPONSE", payload: intentWithoutNav });

    // NOW speak the response (user is already seeing the page)
    await voiceIO.speak(intent.speech);
  }, [voiceIO, options, executeNavigation, executePageAction]);

  // Effect: Handle GREETING phase
  useEffect(() => {
    if (state.phase !== "GREETING") return;

    console.log("[Agnes] GREETING phase - speaking greeting");
    const doGreeting = async () => {
      try {
        await voiceIO.speak(AGNES_GREETING);
      } catch (err) {
        console.error("[Agnes] Greeting TTS error:", err);
      }
      console.log("[Agnes] Greeting complete, transitioning to LISTENING");
      dispatch({ type: "GREETING_COMPLETE" });
    };

    void doGreeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Effect: Handle LISTENING phase - start mic faster
  useEffect(() => {
    if (state.phase !== "LISTENING") return;

    console.log("[Agnes] LISTENING phase - starting mic in 200ms");
    const timer = setTimeout(() => {
      if (state.phase === "LISTENING") {
        console.log("[Agnes] Starting microphone...");
        void voiceIO.startListening();
      }
    }, 200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Effect: Handle THINKING phase - send to AI
  useEffect(() => {
    if (state.phase !== "THINKING" || isProcessingRef.current) return;

    const lastUserMessage = state.transcript.filter(t => t.role === "user").pop();
    if (!lastUserMessage) return;

    isProcessingRef.current = true;
    console.log("[Agnes] THINKING phase - sending to AI:", lastUserMessage.text);

    const process = async () => {
      try {
        const response = await sendToAI(lastUserMessage.text, state.conversationHistory.slice(0, -1));
        console.log("[Agnes] AI response received:", response.substring(0, 100));
        // Pass user's original message to validate navigation intent
        await processAIResponse(response, lastUserMessage.text);
      } catch (error) {
        console.error("[Agnes] AI processing error:", error);
        dispatch({ type: "ERROR", payload: "I encountered an issue. Let me try again." });
        await voiceIO.speak("Sorry, could you repeat that?");
        dispatch({ type: "START_LISTENING" });
      } finally {
        isProcessingRef.current = false;
      }
    };

    void process();
  }, [state.phase, state.transcript, state.conversationHistory, sendToAI, processAIResponse, voiceIO]);

  // Note: Navigation is now handled inline in processAIResponse (navigate FIRST, then speak)
  // The NAVIGATING phase and related effects are no longer used

  // Effect: Handle pending navigation after speech complete (legacy, kept for safety)
  useEffect(() => {
    if (state.phase === "LISTENING" && pendingNavigationRef.current) {
      const nav = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      // Execute navigation directly instead of going through NAVIGATING phase
      void executeNavigation(nav);
    }
  }, [state.phase, executeNavigation]);

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

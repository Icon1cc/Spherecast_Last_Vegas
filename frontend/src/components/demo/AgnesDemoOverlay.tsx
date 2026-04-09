/**
 * AgnesDemoOverlay - Full-screen overlay for Agnes Demo Mode
 * Displays animated sphere, transcript, and controls
 */

import { memo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Mic, MicOff } from "lucide-react";
import AgnesSphere from "./AgnesSphere";
import { useAgnesDemo } from "@/hooks/useAgnesDemo";
import type { DemoPhase } from "@/types/demo";

interface AgnesDemoOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Get status text for current phase
 */
function getStatusText(phase: DemoPhase): string {
  switch (phase) {
    case "GREETING":
      return "Initializing...";
    case "LISTENING":
      return "Listening...";
    case "THINKING":
      return "Processing...";
    case "SPEAKING":
      return "Speaking...";
    case "NAVIGATING":
      return "Navigating...";
    case "COMPLETE":
      return "Complete";
    default:
      return "";
  }
}

/**
 * Get hint text for current phase
 */
function getHintText(phase: DemoPhase): string | null {
  switch (phase) {
    case "LISTENING":
      return "Speak naturally to Agnes";
    case "SPEAKING":
      return "Click mic or speak to interrupt";
    case "THINKING":
      return "Agnes is thinking...";
    default:
      return null;
  }
}

const AgnesDemoOverlay = memo(function AgnesDemoOverlay({
  isOpen,
  onClose,
}: AgnesDemoOverlayProps) {
  const {
    phase,
    transcript,
    currentSpeech,
    isActive,
    startDemo,
    closeDemo,
    interrupt,
  } = useAgnesDemo({
    onComplete: onClose,
    onError: (error) => console.error("Demo error:", error),
  });

  // Start demo when overlay opens
  useEffect(() => {
    if (isOpen && !isActive) {
      startDemo();
    }
  }, [isOpen, isActive, startDemo]);

  // Handle close
  const handleClose = useCallback(() => {
    closeDemo();
    onClose();
  }, [closeDemo, onClose]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  // Handle interrupt on mic click or voice detection during speech
  const handleInterrupt = useCallback(() => {
    if (phase === "SPEAKING") {
      interrupt();
    }
  }, [phase, interrupt]);

  if (!isOpen) return null;

  const statusText = getStatusText(phase);
  const hintText = getHintText(phase);
  const lastTranscript = transcript[transcript.length - 1];

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-hidden">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-md animate-fade-in"
        onClick={handleClose}
      />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-4">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-6 right-6 p-3 rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200 group"
          aria-label="Exit demo"
        >
          <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-200" />
        </button>

        {/* Demo title */}
        <div className="absolute top-6 left-6">
          <h2 className="text-white/90 text-lg font-semibold tracking-wide">
            Agnes Demo
          </h2>
          <p className="text-white/50 text-sm mt-1">
            Voice-guided experience
          </p>
        </div>

        {/* Main sphere */}
        <div className="flex-shrink-0 mb-8">
          <AgnesSphere phase={phase} size="lg" />
        </div>

        {/* Status indicator */}
        {statusText && (
          <div className="flex items-center gap-2 mb-4">
            {phase === "LISTENING" && (
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
              </span>
            )}
            {phase === "THINKING" && (
              <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            )}
            {phase === "SPEAKING" && (
              <span className="relative flex h-3 w-3">
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 animate-pulse" />
              </span>
            )}
            <span className="text-white/70 text-sm font-medium uppercase tracking-wider">
              {statusText}
            </span>
          </div>
        )}

        {/* Transcript / Current speech */}
        <div className="max-w-2xl w-full text-center mb-8 min-h-[80px]">
          {currentSpeech && phase === "SPEAKING" && (
            <p className="text-white/90 text-xl leading-relaxed animate-fade-in">
              "{currentSpeech}"
            </p>
          )}
          {!currentSpeech && lastTranscript && (
            <div className="space-y-2">
              <p className={`text-lg leading-relaxed ${
                lastTranscript.role === "user"
                  ? "text-blue-300/90 italic"
                  : "text-white/80"
              }`}>
                {lastTranscript.role === "user" && (
                  <span className="text-blue-400/70 text-sm mr-2">You:</span>
                )}
                "{lastTranscript.text}"
              </p>
            </div>
          )}
        </div>

        {/* Hint text */}
        {hintText && (
          <p className="text-white/40 text-sm mb-6 animate-pulse">
            {hintText}
          </p>
        )}

        {/* Interrupt/Mic button for speaking phase */}
        {phase === "SPEAKING" && (
          <button
            onClick={handleInterrupt}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200 border border-white/20"
          >
            <Mic className="w-5 h-5" />
            <span className="text-sm font-medium">Interrupt</span>
          </button>
        )}

        {/* Listening indicator */}
        {phase === "LISTENING" && (
          <div className="flex items-center gap-2 px-6 py-3 rounded-full bg-blue-500/20 border border-blue-400/30">
            <div className="flex items-end gap-1 h-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-blue-400 rounded-full animate-sound-bar"
                  style={{
                    animationDelay: `${i * 0.1}s`,
                    height: "100%",
                  }}
                />
              ))}
            </div>
            <span className="text-blue-300 text-sm font-medium ml-2">Listening</span>
          </div>
        )}

        {/* Conversation history (scrollable, collapsed by default) */}
        {transcript.length > 2 && (
          <div className="absolute bottom-6 left-6 right-6 max-h-32 overflow-y-auto">
            <div className="bg-white/5 rounded-lg p-3 backdrop-blur-sm">
              <p className="text-white/40 text-xs mb-2 uppercase tracking-wider">
                Conversation
              </p>
              <div className="space-y-1">
                {transcript.slice(-4).map((entry) => (
                  <p
                    key={entry.id}
                    className={`text-xs truncate ${
                      entry.role === "user"
                        ? "text-blue-300/70"
                        : "text-white/60"
                    }`}
                  >
                    <span className="font-medium">
                      {entry.role === "user" ? "You" : "Agnes"}:
                    </span>{" "}
                    {entry.text.substring(0, 80)}
                    {entry.text.length > 80 && "..."}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});

export default AgnesDemoOverlay;

/**
 * AgnesDemoOverlay - Sidebar overlay for Agnes Demo Mode
 * Shows as a side panel while user can see the main app
 * Clean, transparent design - no blur on main content
 */

import { memo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Mic, Volume2 } from "lucide-react";
import AgnesVoiceOrb from "./AgnesVoiceOrb";
import { useAgnesDemo } from "@/hooks/useAgnesDemo";
import type { DemoPhase } from "@/types/demo";

interface AgnesDemoOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

function getStatusText(phase: DemoPhase): string {
  switch (phase) {
    case "GREETING":
      return "Starting...";
    case "LISTENING":
      return "Listening";
    case "THINKING":
      return "Thinking";
    case "SPEAKING":
      return "Speaking";
    case "NAVIGATING":
      return "Navigating";
    default:
      return "";
  }
}

const AgnesDemoOverlay = memo(function AgnesDemoOverlay({
  isOpen,
  onClose,
}: AgnesDemoOverlayProps) {
  const bargeInTimeoutRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

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

  // Barge-in: Monitor mic during SPEAKING phase and auto-interrupt when user speaks
  // IMPROVED: Lower threshold and faster detection for immediate interruption
  useEffect(() => {
    if (phase !== "SPEAKING") {
      // Clean up when not speaking
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      return;
    }

    // Start monitoring mic for barge-in
    const startBargeInMonitor = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,  // Disable AGC for more consistent levels
          },
        });
        micStreamRef.current = stream;

        const AudioContextClass = window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;

        const audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;  // Smaller for faster processing
        analyser.smoothingTimeConstant = 0.1;  // Less smoothing for faster response
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const waveform = new Uint8Array(analyser.fftSize);
        let speechStartTime: number | null = null;

        // IMPROVED: Lower threshold (0.025) and shorter duration (100ms) for faster interruption
        const BARGE_IN_THRESHOLD = 0.025;
        const BARGE_IN_DURATION_MS = 100;

        // Calibrate ambient noise level first
        let ambientLevel = 0;
        let calibrationFrames = 0;
        const CALIBRATION_FRAMES = 10;

        const checkForBargeIn = () => {
          if (phase !== "SPEAKING" || !analyserRef.current) return;

          analyserRef.current.getByteTimeDomainData(waveform);
          let sum = 0;
          for (const sample of waveform) {
            const normalized = (sample - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / waveform.length);

          // Calibration phase - establish ambient noise floor
          if (calibrationFrames < CALIBRATION_FRAMES) {
            ambientLevel = Math.max(ambientLevel, rms);
            calibrationFrames++;
            bargeInTimeoutRef.current = window.requestAnimationFrame(checkForBargeIn);
            return;
          }

          // Dynamic threshold: ambient noise + fixed threshold
          const dynamicThreshold = Math.max(BARGE_IN_THRESHOLD, ambientLevel * 1.8);

          if (rms >= dynamicThreshold) {
            if (!speechStartTime) {
              speechStartTime = performance.now();
            } else if (performance.now() - speechStartTime >= BARGE_IN_DURATION_MS) {
              // User has been speaking long enough - interrupt immediately!
              console.log("[Agnes] Barge-in detected, RMS:", rms.toFixed(4), "threshold:", dynamicThreshold.toFixed(4));
              interrupt();
              return;
            }
          } else {
            speechStartTime = null;
          }

          bargeInTimeoutRef.current = window.requestAnimationFrame(checkForBargeIn);
        };

        bargeInTimeoutRef.current = window.requestAnimationFrame(checkForBargeIn);
      } catch (err) {
        console.warn("Could not start barge-in monitor:", err);
      }
    };

    startBargeInMonitor();

    return () => {
      if (bargeInTimeoutRef.current) {
        window.cancelAnimationFrame(bargeInTimeoutRef.current);
      }
    };
  }, [phase, interrupt]);

  // Handle close
  const handleClose = useCallback(() => {
    closeDemo();
    onClose();
  }, [closeDemo, onClose]);

  // Keyboard escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  const handleInterrupt = useCallback(() => {
    if (phase === "SPEAKING") {
      interrupt();
    }
  }, [phase, interrupt]);

  if (!isOpen) return null;

  const statusText = getStatusText(phase);

  return createPortal(
    <>
      {/*
        IMPORTANT: NO backdrop or blur layer here!
        Main content remains fully visible and interactive.
        This is a sidebar overlay only.
      */}
      <div
        className="fixed right-0 top-0 bottom-0 w-96 z-[100] flex flex-col animate-slide-in-right"
        style={{
          background: "linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)",
          backdropFilter: "blur(8px)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.4)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h2 className="text-white font-semibold text-lg">Agnes</h2>
            <p className="text-white/40 text-xs">AI Voice Assistant</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all duration-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Voice Orb and status */}
        <div className="flex flex-col items-center py-8 border-b border-white/5">
          <AgnesVoiceOrb phase={phase} size="md" />

          <div className="flex items-center gap-2.5 mt-6">
            {phase === "LISTENING" && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
              </span>
            )}
            {phase === "THINKING" && (
              <div className="w-2.5 h-2.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            )}
            {phase === "SPEAKING" && (
              <Volume2 className="w-4 h-4 text-green-400 animate-pulse" />
            )}
            <span className="text-white/50 text-sm font-medium uppercase tracking-widest">
              {statusText}
            </span>
          </div>
        </div>

        {/* Current speech / Last message */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {currentSpeech && phase === "SPEAKING" && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: "linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%)",
                border: "1px solid rgba(34, 197, 94, 0.15)",
              }}
            >
              <p className="text-xs text-green-400/60 mb-1.5 font-medium">Agnes</p>
              <p className="text-white/90 text-sm leading-relaxed">
                {currentSpeech}
              </p>
            </div>
          )}

          {/* Transcript */}
          <div className="space-y-3">
            {transcript.slice(-6).map((entry) => (
              <div
                key={entry.id}
                className={`rounded-xl p-3.5 transition-all duration-200 ${
                  entry.role === "user"
                    ? "ml-6"
                    : "mr-6"
                }`}
                style={{
                  background: entry.role === "user"
                    ? "linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0.06) 100%)"
                    : "rgba(255, 255, 255, 0.04)",
                  border: entry.role === "user"
                    ? "1px solid rgba(59, 130, 246, 0.15)"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <p className={`text-xs mb-1.5 font-medium ${
                  entry.role === "user" ? "text-blue-400/60" : "text-white/30"
                }`}>
                  {entry.role === "user" ? "You" : "Agnes"}
                </p>
                <p className={`text-sm leading-relaxed ${
                  entry.role === "user" ? "text-blue-200/90" : "text-white/70"
                }`}>
                  {entry.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="p-5 border-t border-white/5">
          {phase === "SPEAKING" ? (
            <button
              onClick={handleInterrupt}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <Mic className="w-4 h-4 text-white/70" />
              <span className="text-sm text-white/80 font-medium">Tap or speak to interrupt</span>
            </button>
          ) : phase === "LISTENING" ? (
            <div
              className="flex items-center justify-center gap-3 py-3.5 rounded-xl"
              style={{
                background: "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.08) 100%)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
              }}
            >
              <div className="flex items-end gap-1 h-5">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-blue-400 rounded-full animate-sound-bar"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
              <span className="text-blue-300 text-sm font-medium">Listening...</span>
            </div>
          ) : phase === "THINKING" ? (
            <div className="flex items-center justify-center gap-3 py-3.5 text-white/40">
              <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Processing...</span>
            </div>
          ) : null}

          <p className="text-center text-white/25 text-xs mt-3">
            Press Esc to close
          </p>
        </div>
      </div>
    </>,
    document.body
  );
});

export default AgnesDemoOverlay;

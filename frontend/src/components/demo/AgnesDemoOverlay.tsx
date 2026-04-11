/**
 * AgnesDemoOverlay - Sidebar overlay for Agnes Demo Mode
 * Shows as a side panel while user can see the main app
 */

import { memo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Mic, Volume2, VolumeX } from "lucide-react";
import AgnesSphere from "./AgnesSphere";
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
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        micStreamRef.current = stream;

        const AudioContextClass = window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;

        const audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const waveform = new Uint8Array(analyser.fftSize);
        let speechStartTime: number | null = null;
        const BARGE_IN_THRESHOLD = 0.04; // Sensitivity for detecting user speech
        const BARGE_IN_DURATION_MS = 300; // Must speak for 300ms to trigger interrupt

        const checkForBargeIn = () => {
          if (phase !== "SPEAKING" || !analyserRef.current) return;

          analyserRef.current.getByteTimeDomainData(waveform);
          let sum = 0;
          for (const sample of waveform) {
            const normalized = (sample - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / waveform.length);

          if (rms >= BARGE_IN_THRESHOLD) {
            if (!speechStartTime) {
              speechStartTime = performance.now();
            } else if (performance.now() - speechStartTime >= BARGE_IN_DURATION_MS) {
              // User has been speaking long enough - interrupt!
              console.log("Barge-in detected, interrupting Agnes");
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
      {/* Sidebar panel - NO backdrop blur, user can see and interact with main content */}
      <div className="fixed right-0 top-0 bottom-0 w-80 z-[100] bg-gradient-to-b from-slate-900 to-slate-950 border-l border-white/10 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-semibold">Agnes</h2>
            <p className="text-white/50 text-xs">Voice Assistant</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sphere and status */}
        <div className="flex flex-col items-center py-6 border-b border-white/5">
          <AgnesSphere phase={phase} size="md" />

          <div className="flex items-center gap-2 mt-4">
            {phase === "LISTENING" && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
            )}
            {phase === "THINKING" && (
              <div className="w-2 h-2 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            )}
            {phase === "SPEAKING" && (
              <Volume2 className="w-4 h-4 text-green-400 animate-pulse" />
            )}
            <span className="text-white/60 text-xs font-medium uppercase tracking-wider">
              {statusText}
            </span>
          </div>
        </div>

        {/* Current speech / Last message */}
        <div className="flex-1 overflow-y-auto p-4">
          {currentSpeech && phase === "SPEAKING" && (
            <div className="bg-white/5 rounded-lg p-3 mb-3">
              <p className="text-xs text-green-400/70 mb-1">Agnes</p>
              <p className="text-white/90 text-sm leading-relaxed">
                {currentSpeech}
              </p>
            </div>
          )}

          {/* Transcript */}
          <div className="space-y-2">
            {transcript.slice(-6).map((entry) => (
              <div
                key={entry.id}
                className={`rounded-lg p-2 ${
                  entry.role === "user"
                    ? "bg-blue-500/10 ml-4"
                    : "bg-white/5 mr-4"
                }`}
              >
                <p className={`text-xs mb-1 ${
                  entry.role === "user" ? "text-blue-400/70" : "text-white/40"
                }`}>
                  {entry.role === "user" ? "You" : "Agnes"}
                </p>
                <p className={`text-sm ${
                  entry.role === "user" ? "text-blue-200/90" : "text-white/70"
                }`}>
                  {entry.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="p-4 border-t border-white/10">
          {phase === "SPEAKING" ? (
            <button
              onClick={handleInterrupt}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <Mic className="w-4 h-4" />
              <span className="text-sm">Tap or speak to interrupt</span>
            </button>
          ) : phase === "LISTENING" ? (
            <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-blue-500/20 border border-blue-400/30">
              <div className="flex items-end gap-0.5 h-4">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-blue-400 rounded-full animate-sound-bar"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
              <span className="text-blue-300 text-sm">Listening...</span>
            </div>
          ) : phase === "THINKING" ? (
            <div className="flex items-center justify-center gap-2 py-3 text-white/50">
              <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Processing...</span>
            </div>
          ) : null}

          <p className="text-center text-white/30 text-xs mt-2">
            Press Esc to close
          </p>
        </div>
      </div>
    </>,
    document.body
  );
});

export default AgnesDemoOverlay;

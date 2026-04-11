/**
 * useVoiceIO - Reusable voice input/output hook for Agnes
 * Refactored to use shared voice utilities
 */

import { useRef, useCallback, useState } from "react";
import {
  VOICE_CONFIG,
  RECORDER_MIME_CANDIDATES,
  normalizeTextForSpeech,
  splitTextForSpeech,
  getAudioContextClass,
  pickSupportedRecorderMimeType,
  extensionForMimeType,
  calculateRMS,
  calculateDynamicThreshold,
} from "@/lib/voiceUtils";

// Destructure config for convenience
const {
  voiceId: ELEVENLABS_VOICE_ID,
  ttsModelId: ELEVENLABS_TTS_MODEL_ID,
  sttModelId: ELEVENLABS_STT_MODEL_ID,
  noiseCalibrationMs: NOISE_CALIBRATION_MS,
  silenceDurationMs: SILENCE_DURATION_MS,
  noSpeechTimeoutMs: NO_SPEECH_TIMEOUT_MS,
  maxRecordingMs: MAX_RECORDING_MS,
  minRecordingMs: MIN_RECORDING_MS,
  minAudioBytesForStt: MIN_AUDIO_BYTES_FOR_STT,
} = VOICE_CONFIG;

const AudioContextClass = getAudioContextClass();

// Re-export for backward compatibility
export { pickSupportedRecorderMimeType, extensionForMimeType };

export interface UseVoiceIOOptions {
  onTranscript?: (text: string) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onListeningStart?: () => void;
  onListeningEnd?: () => void;
  onError?: (error: Error, context: string) => void;
}

export interface UseVoiceIOReturn {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  interrupt: () => void;
}

export function useVoiceIO(options: UseVoiceIOOptions = {}): UseVoiceIOReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs for audio handling
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitorAnimationFrameRef = useRef<number | null>(null);
  const silenceStartTimestampRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);
  const noSpeechTimeoutRef = useRef<number | null>(null);
  const maxRecordingTimeoutRef = useRef<number | null>(null);
  const speechRequestIdRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const recordingMimeTypeRef = useRef<string>("audio/webm");

  // Cleanup helpers
  const stopMicrophoneTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopAudioPlayback = useCallback(() => {
    if (!audioPlaybackRef.current) return;
    audioPlaybackRef.current.pause();
    URL.revokeObjectURL(audioPlaybackRef.current.src);
    audioPlaybackRef.current = null;
  }, []);

  const clearRecordingTimeouts = useCallback(() => {
    if (noSpeechTimeoutRef.current !== null) {
      window.clearTimeout(noSpeechTimeoutRef.current);
      noSpeechTimeoutRef.current = null;
    }
    if (maxRecordingTimeoutRef.current !== null) {
      window.clearTimeout(maxRecordingTimeoutRef.current);
      maxRecordingTimeoutRef.current = null;
    }
  }, []);

  const stopVoiceMonitor = useCallback(() => {
    if (monitorAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(monitorAnimationFrameRef.current);
      monitorAnimationFrameRef.current = null;
    }
    analyserSourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    analyserSourceRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    silenceStartTimestampRef.current = null;
    speechDetectedRef.current = false;
    clearRecordingTimeouts();
  }, [clearRecordingTimeouts]);

  /**
   * Transcribe audio blob using ElevenLabs STT
   */
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string> => {
    // Send the native recorded format directly — ElevenLabs Scribe accepts webm/ogg/mp4 natively.
    // WAV transcoding via AudioContext.decodeAudioData was unreliable across browsers and
    // produced invalid files on codec mismatch, causing 400 errors and infinite retry loops.
    const mimeType = audioBlob.type || recordingMimeTypeRef.current || "audio/webm";
    const extension = extensionForMimeType(mimeType);
    console.log("[VoiceIO] Transcribing audio, type:", mimeType, "size:", audioBlob.size, "ext:", extension);

    const formData = new FormData();
    formData.append("file", audioBlob, `agnes-input.${extension}`);
    formData.append("model_id", ELEVENLABS_STT_MODEL_ID);

    console.log("[VoiceIO] Sending to STT API, filename:", `agnes-input.${extension}`);
    const response = await fetch("/api/elevenlabs/stt", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[VoiceIO] STT API error:", errorText);
      throw new Error(`STT request failed: ${errorText}`);
    }

    const data = (await response.json()) as { text?: string; transcript?: string };
    const result = (data.text ?? data.transcript ?? "").trim();
    console.log("[VoiceIO] STT result:", result);
    return result;
  }, []);

  /**
   * Speak text using ElevenLabs TTS
   */
  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) return;

      try {
        stopAudioPlayback();
        setIsSpeaking(true);
        isSpeakingRef.current = true;
        options.onSpeechStart?.();

        const chunks = splitTextForSpeech(text);
        if (chunks.length === 0) {
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          options.onSpeechEnd?.();
          return;
        }

        const requestId = ++speechRequestIdRef.current;

        for (const chunk of chunks) {
          // Check if we should stop
          if (!isSpeakingRef.current || speechRequestIdRef.current !== requestId) {
            break;
          }

          const response = await fetch("/api/elevenlabs/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: chunk,
              voiceId: ELEVENLABS_VOICE_ID,
              modelId: ELEVENLABS_TTS_MODEL_ID,
              optimizeLatency: 4, // Maximum speed for demo
            }),
          });

          if (!response.ok) {
            throw new Error(`TTS request failed: ${await response.text()}`);
          }

          // Check again before playing
          if (!isSpeakingRef.current || speechRequestIdRef.current !== requestId) {
            break;
          }

          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audioPlaybackRef.current = audio;

          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              audio.onended = null;
              audio.onerror = null;
              audio.onpause = null;
              URL.revokeObjectURL(audioUrl);
              if (audioPlaybackRef.current === audio) {
                audioPlaybackRef.current = null;
              }
            };

            audio.onended = () => {
              cleanup();
              resolve();
            };
            audio.onerror = () => {
              cleanup();
              reject(new Error("Audio playback failed"));
            };
            audio.onpause = () => {
              cleanup();
              resolve(); // Treat pause as graceful stop
            };

            void audio.play().catch((error) => {
              cleanup();
              reject(error);
            });
          });
        }
      } catch (error) {
        console.error("TTS error:", error);
        options.onError?.(error instanceof Error ? error : new Error(String(error)), "tts");
      } finally {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        options.onSpeechEnd?.();
      }
    },
    [options, stopAudioPlayback]
  );

  /**
   * Stop speaking immediately
   */
  const stopSpeaking = useCallback(() => {
    speechRequestIdRef.current += 1;
    isSpeakingRef.current = false;
    stopAudioPlayback();
    setIsSpeaking(false);
  }, [stopAudioPlayback]);

  /**
   * Stop listening
   */
  const stopListening = useCallback(() => {
    clearRecordingTimeouts();
    stopVoiceMonitor();

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsListening(false);
      options.onListeningEnd?.();
      return;
    }

    recorder.stop();
    setIsListening(false);
  }, [clearRecordingTimeouts, stopVoiceMonitor, options]);

  /**
   * Start listening for voice input
   */
  const startListening = useCallback(async (): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      options.onError?.(new Error("Browser does not support voice recording"), "stt");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      silenceStartTimestampRef.current = null;
      speechDetectedRef.current = false;

      const stopRecordingFromMonitor = () => {
        if (mediaRecorderRef.current?.state === "recording") {
          stopListening();
        }
      };

      // Set up audio analysis for silence detection
      if (AudioContextClass) {
        const audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.2;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        analyserSourceRef.current = source;

        const waveform = new Uint8Array(analyser.fftSize);
        const calibrationEndAt = performance.now() + NOISE_CALIBRATION_MS;
        const recordingStartedAt = performance.now();
        const calibrationSamples: number[] = [];

        const monitorAudio = (timestamp: number) => {
          if (mediaRecorderRef.current?.state !== "recording") return;

          analyser.getByteTimeDomainData(waveform);
          const rms = calculateRMS(waveform);

          // Calibration phase - collect ambient noise samples
          if (!speechDetectedRef.current && timestamp <= calibrationEndAt) {
            calibrationSamples.push(rms);
          }

          const calibrationAverage =
            calibrationSamples.length > 0
              ? calibrationSamples.reduce((a, v) => a + v, 0) / calibrationSamples.length
              : VOICE_CONFIG.baseSilenceThreshold;

          const dynamicThreshold = calculateDynamicThreshold(calibrationAverage);

          // Any sound above threshold = speech detected
          if (rms >= dynamicThreshold) {
            speechDetectedRef.current = true;
            silenceStartTimestampRef.current = null;
          } else if (speechDetectedRef.current) {
            // Only start silence timer after minimum recording time
            const elapsedMs = timestamp - recordingStartedAt;
            if (elapsedMs >= MIN_RECORDING_MS) {
              if (silenceStartTimestampRef.current === null) {
                silenceStartTimestampRef.current = timestamp;
              }
              if (timestamp - silenceStartTimestampRef.current >= SILENCE_DURATION_MS) {
                stopRecordingFromMonitor();
                return;
              }
            }
          }

          monitorAnimationFrameRef.current = window.requestAnimationFrame(monitorAudio);
        };

        monitorAnimationFrameRef.current = window.requestAnimationFrame(monitorAudio);
      }

      // Timeouts
      noSpeechTimeoutRef.current = window.setTimeout(() => {
        // Even if no speech detected locally, still process the audio
        // Let ElevenLabs decide - local detection can be unreliable
        if (mediaRecorderRef.current?.state === "recording") {
          speechDetectedRef.current = true; // Force processing
          stopListening();
        }
      }, NO_SPEECH_TIMEOUT_MS);

      maxRecordingTimeoutRef.current = window.setTimeout(() => {
        stopListening();
      }, MAX_RECORDING_MS);

      const handleDataAvailable = (event: BlobEvent) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      const handleStop = async () => {
        stopVoiceMonitor();
        stopMicrophoneTracks();
        mediaRecorderRef.current = null;
        setIsListening(false);
        options.onListeningEnd?.();

        if (audioChunksRef.current.length === 0) {
          options.onError?.(new Error("No audio recorded"), "stt");
          return;
        }

        setIsProcessing(true);
        try {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: audioChunksRef.current[0]?.type || recordingMimeTypeRef.current || "audio/webm",
          });

          // Always send to ElevenLabs - let the server decide if there's speech
          // Don't rely on local speech detection which can be unreliable
          if (audioBlob.size < MIN_AUDIO_BYTES_FOR_STT) {
            options.onError?.(new Error("Recording too short. Please speak a bit longer."), "stt");
            return;
          }

          const transcript = await transcribeAudio(audioBlob);

          if (transcript) {
            options.onTranscript?.(transcript);
          } else {
            options.onError?.(new Error("No speech detected"), "stt");
          }
        } catch (error) {
          console.error("Transcription failed:", error);
          options.onError?.(error instanceof Error ? error : new Error(String(error)), "stt");
        } finally {
          audioChunksRef.current = [];
          setIsProcessing(false);
        }
      };

      const preferredMimeType = pickSupportedRecorderMimeType();
      if (preferredMimeType) {
        const mimeRecorder = new MediaRecorder(stream, { mimeType: preferredMimeType });
        mediaRecorderRef.current = mimeRecorder;
        recordingMimeTypeRef.current = mimeRecorder.mimeType || preferredMimeType;
      } else {
        const defaultRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = defaultRecorder;
        recordingMimeTypeRef.current = defaultRecorder.mimeType || "audio/webm";
      }

      const activeRecorder = mediaRecorderRef.current;
      if (!activeRecorder) {
        throw new Error("Unable to initialize media recorder");
      }

      activeRecorder.ondataavailable = handleDataAvailable;
      activeRecorder.onstop = handleStop;
      activeRecorder.start(250);
      setIsListening(true);
      options.onListeningStart?.();
    } catch (error) {
      console.error("Microphone access failed:", error);
      options.onError?.(error instanceof Error ? error : new Error(String(error)), "stt");
      stopVoiceMonitor();
      stopMicrophoneTracks();
      setIsListening(false);
    }
  }, [options, stopListening, stopMicrophoneTracks, stopVoiceMonitor, transcribeAudio]);

  /**
   * Interrupt - stop speaking and start listening
   */
  const interrupt = useCallback(() => {
    stopSpeaking();
    void startListening();
  }, [stopSpeaking, startListening]);

  return {
    isListening,
    isSpeaking,
    isProcessing,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    interrupt,
  };
}

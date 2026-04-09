/**
 * useVoiceIO - Reusable voice input/output hook for Agnes
 * Extracted and adapted from ChatPanel.tsx for demo mode
 */

import { useRef, useCallback, useState } from "react";

// ElevenLabs configuration
const DEFAULT_ELEVENLABS_VOICE_ID = "s3TPKV1kjDlVtZbl4Ksh";
const ELEVENLABS_VOICE_ID =
  import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() ?? DEFAULT_ELEVENLABS_VOICE_ID;
const ELEVENLABS_TTS_MODEL_ID =
  import.meta.env.VITE_ELEVENLABS_TTS_MODEL_ID?.trim() ?? "eleven_multilingual_v2";
const ELEVENLABS_STT_MODEL_ID =
  import.meta.env.VITE_ELEVENLABS_STT_MODEL_ID?.trim() ?? "scribe_v1";

// Voice detection constants - tuned for reliable speech detection
const BASE_SILENCE_THRESHOLD = 0.008;       // Very low = catches quiet speech
const MIN_DYNAMIC_SILENCE_THRESHOLD = 0.005; // Minimum threshold floor
const MAX_DYNAMIC_SILENCE_THRESHOLD = 0.04; // Maximum threshold ceiling
const SILENCE_THRESHOLD_MULTIPLIER = 1.5;   // How much above ambient noise to trigger
const NOISE_CALIBRATION_MS = 300;           // Quick calibration
const SILENCE_DURATION_MS = 1500;           // Wait 1.5s of silence before stopping
const NO_SPEECH_TIMEOUT_MS = 15000;         // Max wait for speech to start (15s)
const MAX_RECORDING_MS = 45000;             // Max recording duration (45s)
const MIN_RECORDING_MS = 1500;              // Minimum recording time before allowing stop
const TTS_CHUNK_MAX_CHARS = 180;
const MIN_AUDIO_BYTES_FOR_STT = 4096;
const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

const AudioContextClass =
  typeof window !== "undefined"
    ? window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    : undefined;

const pickSupportedRecorderMimeType = (): string | null => {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }
  return RECORDER_MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
};

const extensionForMimeType = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  return "webm";
};

const encodeAudioBufferToWav = (audioBuffer: AudioBuffer): Blob => {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: channelCount }, (_, index) =>
    audioBuffer.getChannelData(index)
  );

  let offset = 44;
  for (let i = 0; i < frameCount; i += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
};

const transcodeToWavIfPossible = async (source: Blob): Promise<Blob | null> => {
  if (source.type.toLowerCase().includes("wav")) return source;
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  try {
    const arrayBuffer = await source.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    return encodeAudioBufferToWav(decoded);
  } catch {
    return null;
  } finally {
    void context.close();
  }
};

/**
 * Normalize text for TTS - remove markdown and clean up
 */
const normalizeTextForSpeech = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Split text into chunks for TTS
 */
const splitTextForSpeech = (text: string, maxChars: number = TTS_CHUNK_MAX_CHARS): string[] => {
  const normalized = normalizeTextForSpeech(text);
  if (!normalized) return [];

  const sentences =
    normalized.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [normalized];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }

    const candidate = `${current} ${sentence}`.trim();
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
};

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
    const transcoded = await transcodeToWavIfPossible(audioBlob);
    const uploadBlob = transcoded ?? audioBlob;
    const extension = extensionForMimeType(uploadBlob.type || audioBlob.type || "audio/webm");

    const formData = new FormData();
    formData.append("file", uploadBlob, `agnes-input.${extension}`);
    formData.append("model_id", ELEVENLABS_STT_MODEL_ID);

    const response = await fetch("/api/elevenlabs/stt", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`STT request failed: ${errorText}`);
    }

    const data = (await response.json()) as { text?: string; transcript?: string };
    return (data.text ?? data.transcript ?? "").trim();
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
          let sum = 0;
          for (const sample of waveform) {
            const normalized = (sample - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / waveform.length);

          // Calibration phase - collect ambient noise samples
          if (!speechDetectedRef.current && timestamp <= calibrationEndAt) {
            calibrationSamples.push(rms);
          }

          const calibrationAverage =
            calibrationSamples.length > 0
              ? calibrationSamples.reduce((a, v) => a + v, 0) / calibrationSamples.length
              : BASE_SILENCE_THRESHOLD;

          const dynamicThreshold = Math.max(
            MIN_DYNAMIC_SILENCE_THRESHOLD,
            Math.min(
              MAX_DYNAMIC_SILENCE_THRESHOLD,
              Math.max(BASE_SILENCE_THRESHOLD, calibrationAverage * SILENCE_THRESHOLD_MULTIPLIER)
            )
          );

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

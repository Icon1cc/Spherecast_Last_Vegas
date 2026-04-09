import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { X, Send, Mic, MicOff, Plus, Volume2, VolumeX } from "lucide-react";
import { format } from "date-fns";
import type { ChatMessage, ChatSession } from "@/types/chat";
import { sendChatMessage } from "@/lib/api";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

const AGNES_INITIALS = "AG";
const AGNES_GREETING = "Hello I am Agnes, how can I help you today";
const DEFAULT_ELEVENLABS_VOICE_ID = "s3TPKV1kjDlVtZbl4Ksh";
const ELEVENLABS_VOICE_ID =
  import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() ?? DEFAULT_ELEVENLABS_VOICE_ID;
const ELEVENLABS_TTS_MODEL_ID =
  import.meta.env.VITE_ELEVENLABS_TTS_MODEL_ID?.trim() ?? "eleven_multilingual_v2";
const ELEVENLABS_STT_MODEL_ID =
  import.meta.env.VITE_ELEVENLABS_STT_MODEL_ID?.trim() ?? "scribe_v1";
const BASE_SILENCE_THRESHOLD = 0.03;
const MIN_DYNAMIC_SILENCE_THRESHOLD = 0.02;
const MAX_DYNAMIC_SILENCE_THRESHOLD = 0.09;
const SILENCE_THRESHOLD_MULTIPLIER = 2.2;
const NOISE_CALIBRATION_MS = 700;
const SILENCE_DURATION_MS = 900;
const NO_SPEECH_TIMEOUT_MS = 6000;
const MAX_RECORDING_MS = 20000;
const TTS_CHUNK_MAX_CHARS = 180;

const createMessage = (role: ChatMessage["role"], content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  timestamp: new Date(),
});

const createAgnesSession = (title: string): ChatSession => ({
  id: crypto.randomUUID(),
  title,
  date: new Date(),
  messages: [createMessage("assistant", AGNES_GREETING)],
});

// Build chat history for API calls
const buildChatHistory = (messages: ChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> => {
  return messages
    .filter((msg) => msg.content !== AGNES_GREETING)
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
};

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

/**
 * Renders markdown-formatted text with proper styling.
 * Supports: **bold**, *italic*, bullet lists, numbered lists
 */
const MessageContent = ({ content }: { content: string }) => {
  const formattedContent = useMemo(() => {
    // Split by lines to handle lists
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];
    let listType: "ul" | "ol" | null = null;

    const flushList = () => {
      if (listItems.length > 0 && listType) {
        const ListTag = listType;
        elements.push(
          <ListTag key={elements.length} className={listType === "ul" ? "list-disc ml-4 my-2" : "list-decimal ml-4 my-2"}>
            {listItems.map((item, i) => (
              <li key={i} className="my-0.5">{formatInlineText(item)}</li>
            ))}
          </ListTag>
        );
        listItems = [];
        listType = null;
      }
    };

    const formatInlineText = (text: string): React.ReactNode => {
      // Handle **bold** and *italic*
      const parts: React.ReactNode[] = [];
      let remaining = text;
      let key = 0;

      while (remaining.length > 0) {
        // Check for bold (**text**)
        const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
        if (boldMatch) {
          parts.push(<strong key={key++} className="font-semibold">{boldMatch[1]}</strong>);
          remaining = remaining.slice(boldMatch[0].length);
          continue;
        }

        // Check for italic (*text*)
        const italicMatch = remaining.match(/^\*([^*]+)\*/);
        if (italicMatch) {
          parts.push(<em key={key++} className="italic">{italicMatch[1]}</em>);
          remaining = remaining.slice(italicMatch[0].length);
          continue;
        }

        // Check for inline code (`code`)
        const codeMatch = remaining.match(/^`([^`]+)`/);
        if (codeMatch) {
          parts.push(
            <code key={key++} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
              {codeMatch[1]}
            </code>
          );
          remaining = remaining.slice(codeMatch[0].length);
          continue;
        }

        // Find next special character
        const nextSpecial = remaining.search(/[*`]/);
        if (nextSpecial === -1) {
          parts.push(remaining);
          break;
        } else if (nextSpecial === 0) {
          // Special char but no match - treat as literal
          parts.push(remaining[0]);
          remaining = remaining.slice(1);
        } else {
          parts.push(remaining.slice(0, nextSpecial));
          remaining = remaining.slice(nextSpecial);
        }
      }

      return parts.length === 1 ? parts[0] : <>{parts}</>;
    };

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Check for bullet list (- or *)
      const bulletMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        if (listType === "ol") flushList();
        listType = "ul";
        listItems.push(bulletMatch[1]);
        continue;
      }

      // Check for numbered list (1. 2. etc)
      const numberedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
      if (numberedMatch) {
        if (listType === "ul") flushList();
        listType = "ol";
        listItems.push(numberedMatch[1]);
        continue;
      }

      // Not a list item - flush any pending list
      flushList();

      // Empty line = paragraph break
      if (!trimmedLine) {
        elements.push(<br key={elements.length} />);
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={elements.length} className="my-1">
          {formatInlineText(trimmedLine)}
        </p>
      );
    }

    // Flush any remaining list
    flushList();

    return elements;
  }, [content]);

  return <div className="space-y-1">{formattedContent}</div>;
};

const ChatPanel = ({ open, onClose }: ChatPanelProps) => {
  const initialSessionRef = useRef<ChatSession>(createAgnesSession("Agnes Session"));
  const [sessions, setSessions] = useState<ChatSession[]>([initialSessionRef.current]);
  const [activeSessionId, setActiveSessionId] = useState(initialSessionRef.current.id);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
  const greetedSessionsRef = useRef<Set<string>>(new Set());
  const speakerEnabledRef = useRef(true);
  const speechRequestIdRef = useRef(0);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];

  useEffect(() => {
    speakerEnabledRef.current = isSpeakerEnabled;
  }, [isSpeakerEnabled]);

  const appendMessagesToSession = useCallback((sessionId: string, newMessages: ChatMessage[]) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? { ...session, messages: [...session.messages, ...newMessages] }
          : session
      )
    );
  }, []);

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

  const speakText = useCallback(
    async (text: string) => {
      if (!speakerEnabledRef.current) return;

      try {
        stopAudioPlayback();

        const chunks = splitTextForSpeech(text);
        if (chunks.length === 0) return;

        const requestId = ++speechRequestIdRef.current;

        for (const chunk of chunks) {
          if (!speakerEnabledRef.current || speechRequestIdRef.current !== requestId) {
            return;
          }

          const response = await fetch("/api/elevenlabs/tts", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: chunk,
              voiceId: ELEVENLABS_VOICE_ID,
              modelId: ELEVENLABS_TTS_MODEL_ID,
              optimizeLatency: 3,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`TTS request failed: ${errorText}`);
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
              // Treat manual stop/pause as a graceful cancellation.
              cleanup();
              resolve();
            };

            void audio.play().catch((error) => {
              cleanup();
              reject(error);
            });
          });
        }
      } catch (error) {
        console.error("Unable to play ElevenLabs audio", error);
      }
    },
    [stopAudioPlayback]
  );

  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append("file", audioBlob, "agnes-user-journey.webm");
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

  const processUserMessage = useCallback(
    async (sessionId: string, userText: string, speakResponse: boolean = false) => {
      const userMessage = createMessage("user", userText);
      appendMessagesToSession(sessionId, [userMessage]);

      try {
        const currentSession = sessions.find((s) => s.id === sessionId);
        const history = currentSession ? buildChatHistory(currentSession.messages) : [];

        const response = await sendChatMessage(userText, history);
        const assistantMessage = createMessage("assistant", response.response);
        appendMessagesToSession(sessionId, [assistantMessage]);

        // Only speak if this was a voice interaction
        if (speakResponse) {
          void speakText(response.response);
        }
      } catch (error) {
        console.error("Failed to get AI response:", error);
        const errorMessage = createMessage(
          "assistant",
          "I encountered an error processing your request. Please try again."
        );
        appendMessagesToSession(sessionId, [errorMessage]);
        if (speakResponse) {
          void speakText(errorMessage.content);
        }
      }
    },
    [appendMessagesToSession, sessions, speakText]
  );

  const stopListening = useCallback(() => {
    clearRecordingTimeouts();
    stopVoiceMonitor();

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsListening(false);
      return;
    }

    recorder.stop();
    setIsListening(false);
  }, [clearRecordingTimeouts, stopVoiceMonitor]);

  const startListening = useCallback(async () => {
    if (!activeSessionId) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      appendMessagesToSession(activeSessionId, [
        createMessage("assistant", "This browser does not support microphone recording."),
      ]);
      return;
    }

    try {
      const recordingSessionId = activeSessionId;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      silenceStartTimestampRef.current = null;
      speechDetectedRef.current = false;

      const stopRecordingFromMonitor = () => {
        if (mediaRecorderRef.current?.state === "recording") {
          stopListening();
        }
      };

      const AudioContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

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
        const calibrationSamples: number[] = [];

        const monitorAudio = (timestamp: number) => {
          if (mediaRecorderRef.current?.state !== "recording") {
            return;
          }

          analyser.getByteTimeDomainData(waveform);
          let sum = 0;

          for (const sample of waveform) {
            const normalized = (sample - 128) / 128;
            sum += normalized * normalized;
          }

          const rms = Math.sqrt(sum / waveform.length);
          if (!speechDetectedRef.current && timestamp <= calibrationEndAt) {
            calibrationSamples.push(rms);
          }

          const calibrationAverage =
            calibrationSamples.length > 0
              ? calibrationSamples.reduce((acc, value) => acc + value, 0) / calibrationSamples.length
              : BASE_SILENCE_THRESHOLD;

          const dynamicThreshold = Math.max(
            MIN_DYNAMIC_SILENCE_THRESHOLD,
            Math.min(
              MAX_DYNAMIC_SILENCE_THRESHOLD,
              Math.max(BASE_SILENCE_THRESHOLD, calibrationAverage * SILENCE_THRESHOLD_MULTIPLIER)
            )
          );

          if (rms >= dynamicThreshold) {
            speechDetectedRef.current = true;
            silenceStartTimestampRef.current = null;
          } else if (speechDetectedRef.current) {
            if (silenceStartTimestampRef.current === null) {
              silenceStartTimestampRef.current = timestamp;
            }

            if (timestamp - silenceStartTimestampRef.current >= SILENCE_DURATION_MS) {
              stopRecordingFromMonitor();
              return;
            }
          }

          monitorAnimationFrameRef.current = window.requestAnimationFrame(monitorAudio);
        };

        monitorAnimationFrameRef.current = window.requestAnimationFrame(monitorAudio);
      }

      noSpeechTimeoutRef.current = window.setTimeout(() => {
        if (!speechDetectedRef.current) {
          stopListening();
        }
      }, NO_SPEECH_TIMEOUT_MS);

      maxRecordingTimeoutRef.current = window.setTimeout(() => {
        stopListening();
      }, MAX_RECORDING_MS);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stopVoiceMonitor();
        stopMicrophoneTracks();
        mediaRecorderRef.current = null;
        setIsListening(false);

        if (audioChunksRef.current.length === 0) {
          return;
        }

        setIsVoiceProcessing(true);
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const transcript = await transcribeAudio(audioBlob);

          if (!transcript) {
            appendMessagesToSession(recordingSessionId, [
              createMessage(
                "assistant",
                "I could not hear a clear message. Please try describing your journey again."
              ),
            ]);
            return;
          }

          processUserMessage(recordingSessionId, transcript, true);
        } catch (error) {
          console.error("Voice transcription failed", error);
          const errorDetail =
            error instanceof Error && error.message
              ? error.message
              : "Voice transcription failed";
          appendMessagesToSession(recordingSessionId, [
            createMessage(
              "assistant",
              `I could not process that recording. ${errorDetail}`
            ),
          ]);
        } finally {
          audioChunksRef.current = [];
          setIsVoiceProcessing(false);
        }
      };

      recorder.start(250);
      setIsListening(true);
    } catch (error) {
      console.error("Microphone access failed", error);
      appendMessagesToSession(activeSessionId, [
        createMessage(
          "assistant",
          "I could not access your microphone. Please allow mic permission and try again."
        ),
      ]);
      stopVoiceMonitor();
      stopMicrophoneTracks();
      setIsListening(false);
    }
  }, [
    activeSessionId,
    appendMessagesToSession,
    processUserMessage,
    stopListening,
    stopMicrophoneTracks,
    stopVoiceMonitor,
    transcribeAudio,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!open || !activeSession) return;

    const hasGreeting = activeSession.messages.some(
      (msg) => msg.role === "assistant" && msg.content === AGNES_GREETING
    );

    if (!hasGreeting) {
      appendMessagesToSession(activeSession.id, [createMessage("assistant", AGNES_GREETING)]);
    }
    // Voice greeting removed - Agnes only speaks after mic interaction
  }, [open, activeSession, appendMessagesToSession]);

  useEffect(() => {
    if (!open && isListening) {
      stopListening();
    }
  }, [isListening, open, stopListening]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      }
      stopVoiceMonitor();
      stopMicrophoneTracks();
      stopAudioPlayback();
    };
  }, [stopAudioPlayback, stopMicrophoneTracks, stopVoiceMonitor]);

  const sendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || !activeSession) {
      return;
    }

    setInput("");
    // Don't speak response for text input - only for voice
    await processUserMessage(activeSessionId, trimmedInput, false);
  }, [input, activeSession, processUserMessage, activeSessionId]);

  const createNewChat = useCallback(() => {
    const newSession = createAgnesSession("New Chat");
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleVoice = useCallback(async () => {
    if (isListening) {
      stopListening();
      return;
    }

    // Speak greeting on first mic click for this session
    if (activeSessionId && !greetedSessionsRef.current.has(activeSessionId)) {
      greetedSessionsRef.current.add(activeSessionId);
      await speakText(AGNES_GREETING);
    }

    void startListening();
  }, [isListening, startListening, stopListening, activeSessionId, speakText]);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerEnabled((prev) => {
      const next = !prev;
      if (!next) {
        speechRequestIdRef.current += 1;
        stopAudioPlayback();
      }
      return next;
    });
  }, [stopAudioPlayback]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div
        className="absolute inset-0 bg-foreground/30 md:bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full md:w-[520px] h-full bg-card shadow-2xl animate-slide-in-right flex flex-col">
        {/* Header */}
        <header className="h-14 bg-header flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center ring-1 ring-header-foreground/30 text-xs font-bold">
              {AGNES_INITIALS}
            </div>
            <span className="text-header-foreground font-semibold text-sm">Agnes Assistant</span>
          </div>
          <button
            onClick={onClose}
            className="text-header-foreground/70 hover:text-header-foreground transition-colors"
            aria-label="Close chat panel"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Sessions Sidebar */}
          <aside className="w-28 md:w-32 bg-muted border-r flex flex-col shrink-0">
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`w-full text-left p-2 rounded text-xs transition-colors ${
                    session.id === activeSessionId
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-background"
                  }`}
                >
                  <div className="truncate font-medium">{session.title}</div>
                  <div className="text-[10px] opacity-60">
                    {format(session.date, "MMM d")}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={createNewChat}
              className="m-2 p-2 rounded border border-dashed border-muted-foreground/30 text-muted-foreground text-xs flex items-center justify-center gap-1 hover:bg-background transition-colors"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </aside>

          {/* Messages Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex items-start gap-2 max-w-[85%] ${
                      msg.role === "user" ? "flex-row-reverse" : ""
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-border text-[10px] font-bold">
                        {AGNES_INITIALS}
                      </div>
                    )}
                    <div>
                      <div
                        className={`px-3 py-2 rounded-lg text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <MessageContent content={msg.content} />
                        ) : (
                          msg.content
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 px-1">
                        {format(msg.timestamp, "h:mm a")}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t p-3 flex items-center gap-2 shrink-0">
              <button
                onClick={toggleVoice}
                className={`p-2 rounded-full transition-colors ${
                  isListening
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                aria-label={isListening ? "Stop listening" : "Start voice input"}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                onClick={toggleSpeaker}
                className={`p-2 rounded-full transition-colors ${
                  isSpeakerEnabled
                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                aria-label={isSpeakerEnabled ? "Disable Agnes voice" : "Enable Agnes voice"}
                title={isSpeakerEnabled ? "Agnes voice enabled" : "Agnes voice disabled"}
              >
                {isSpeakerEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>
              {isListening && (
                <div className="flex items-center gap-1" aria-label="Voice recording active">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-primary rounded-full animate-pulse"
                      style={{
                        height: `${8 + Math.random() * 12}px`,
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
              )}
              {isListening && (
                <span className="text-[11px] text-muted-foreground">
                  Listening... I will send when you pause.
                </span>
              )}
              {isVoiceProcessing && (
                <span className="text-[11px] text-muted-foreground">Processing voice...</span>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Agnes anything..."
                className="flex-1 px-3 py-2 text-sm bg-muted rounded-md border-0 outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="Message input"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isVoiceProcessing}
                className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;

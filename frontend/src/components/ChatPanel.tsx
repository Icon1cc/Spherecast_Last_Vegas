import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Mic, MicOff, Plus } from "lucide-react";
import { format } from "date-fns";
import type { ChatMessage, ChatSession } from "@/data/sampleData";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

const APP_INITIALS = "JR";
const JARVIS_GREETING = "Hello I am jarvis, how can I help you today";
const DEFAULT_ELEVENLABS_VOICE_ID = "s3TPKV1kjDlVtZbl4Ksh";
const ELEVENLABS_VOICE_ID =
  import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() ?? DEFAULT_ELEVENLABS_VOICE_ID;
const ELEVENLABS_TTS_MODEL_ID =
  import.meta.env.VITE_ELEVENLABS_TTS_MODEL_ID?.trim() ?? "eleven_multilingual_v2";
const ELEVENLABS_STT_MODEL_ID =
  import.meta.env.VITE_ELEVENLABS_STT_MODEL_ID?.trim() ?? "scribe_v1";
const SILENCE_THRESHOLD = 0.025;
const SILENCE_DURATION_MS = 900;
const NO_SPEECH_TIMEOUT_MS = 6000;
const MAX_RECORDING_MS = 20000;

const createMessage = (role: ChatMessage["role"], content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  timestamp: new Date(),
});

const createJarvisSession = (title: string): ChatSession => ({
  id: crypto.randomUUID(),
  title,
  date: new Date(),
  messages: [createMessage("assistant", JARVIS_GREETING)],
});

const buildAssistantReply = (userText: string): string => {
  const normalizedText = userText.trim().toLowerCase();

  if (/\b(hi|hey|hello|yo)\b/.test(normalizedText)) {
    return "Hey, I am doing well and fully ready to help. Share the first step in your user journey.";
  }

  if (/how are you|how're you|how you doing/.test(normalizedText)) {
    return "I am doing great. Tell me the first step in your user journey and I will map it with you.";
  }

  if (/\b(thanks|thank you)\b/.test(normalizedText)) {
    return "You are welcome. What is the next step in the flow?";
  }

  if (/\b(journey|user flow|funnel|onboarding)\b/.test(normalizedText)) {
    return "Perfect. Start from the trigger event, then tell me what the user sees, does, and the outcome.";
  }

  return `Got it. I noted: "${userText}". What happens right after this step?`;
};

const ChatPanel = ({ open, onClose }: ChatPanelProps) => {
  const initialSessionRef = useRef<ChatSession>(createJarvisSession("Jarvis Session"));
  const [sessions, setSessions] = useState<ChatSession[]>([initialSessionRef.current]);
  const [activeSessionId, setActiveSessionId] = useState(initialSessionRef.current.id);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
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
  const greetedSessionIdsRef = useRef<Set<string>>(new Set());

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];

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
      try {
        stopAudioPlayback();

        const response = await fetch("/api/elevenlabs/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            voiceId: ELEVENLABS_VOICE_ID,
            modelId: ELEVENLABS_TTS_MODEL_ID,
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
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          if (audioPlaybackRef.current === audio) {
            audioPlaybackRef.current = null;
          }
        };

        await audio.play();
      } catch (error) {
        console.error("Unable to play ElevenLabs audio", error);
      }
    },
    [stopAudioPlayback]
  );

  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append("file", audioBlob, "jarvis-user-journey.webm");
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
    (sessionId: string, userText: string) => {
      const userMessage = createMessage("user", userText);
      const assistantReply = buildAssistantReply(userText);
      const assistantMessage = createMessage("assistant", assistantReply);

      appendMessagesToSession(sessionId, [userMessage, assistantMessage]);
      void speakText(assistantReply);
    },
    [appendMessagesToSession, speakText]
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

          if (rms >= SILENCE_THRESHOLD) {
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

          processUserMessage(recordingSessionId, transcript);
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
      (msg) => msg.role === "assistant" && msg.content === JARVIS_GREETING
    );

    if (!hasGreeting) {
      appendMessagesToSession(activeSession.id, [createMessage("assistant", JARVIS_GREETING)]);
    }

    if (!greetedSessionIdsRef.current.has(activeSession.id)) {
      greetedSessionIdsRef.current.add(activeSession.id);
      void speakText(JARVIS_GREETING);
    }
  }, [open, activeSession, appendMessagesToSession, speakText]);

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

  const sendMessage = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput || !activeSession) {
      return;
    }

    const userMessage = createMessage("user", trimmedInput);
    const aiResponse = createMessage("assistant", buildAssistantReply(trimmedInput));

    appendMessagesToSession(activeSessionId, [userMessage, aiResponse]);
    void speakText(aiResponse.content);
    setInput("");
  }, [input, activeSession, appendMessagesToSession, activeSessionId, speakText]);

  const createNewChat = useCallback(() => {
    const newSession = createJarvisSession("New Chat");
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleVoice = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }

    void startListening();
  }, [isListening, startListening, stopListening]);

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
          <span className="text-header-foreground font-semibold text-sm">Jarvis Assistant</span>
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
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0 mt-0.5">
                        {APP_INITIALS}
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
                        {msg.content}
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
                placeholder="Describe the user journey..."
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

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
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY?.trim() ?? "";
const ELEVENLABS_VOICE_ID =
  import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() ?? DEFAULT_ELEVENLABS_VOICE_ID;
const ELEVENLABS_TTS_MODEL_ID =
  import.meta.env.VITE_ELEVENLABS_TTS_MODEL_ID?.trim() ?? "eleven_multilingual_v2";
const ELEVENLABS_STT_MODEL_ID =
  import.meta.env.VITE_ELEVENLABS_STT_MODEL_ID?.trim() ?? "scribe_v1";

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

  const speakText = useCallback(
    async (text: string) => {
      if (!ELEVENLABS_API_KEY) return;

      try {
        stopAudioPlayback();

        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          {
            method: "POST",
            headers: {
              Accept: "audio/mpeg",
              "Content-Type": "application/json",
              "xi-api-key": ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
              text,
              model_id: ELEVENLABS_TTS_MODEL_ID,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`ElevenLabs TTS failed: ${errorText}`);
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
    if (!ELEVENLABS_API_KEY) {
      throw new Error("Missing ElevenLabs API key");
    }

    const formData = new FormData();
    formData.append("file", audioBlob, "jarvis-user-journey.webm");
    formData.append("model_id", ELEVENLABS_STT_MODEL_ID);

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs STT failed: ${errorText}`);
    }

    const data = (await response.json()) as { text?: string; transcript?: string };
    return (data.text ?? data.transcript ?? "").trim();
  }, []);

  const startListening = useCallback(async () => {
    if (!activeSessionId) return;

    if (!ELEVENLABS_API_KEY) {
      appendMessagesToSession(activeSessionId, [
        createMessage(
          "assistant",
          "I need VITE_ELEVENLABS_API_KEY in your .env file before I can process voice."
        ),
      ]);
      return;
    }

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

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
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

          const userMessage = createMessage("user", transcript);
          const aiResponse = createMessage(
            "assistant",
            `Thanks, I captured this part of your journey: "${transcript}". Please continue with the next step.`
          );

          appendMessagesToSession(recordingSessionId, [userMessage, aiResponse]);
          void speakText(aiResponse.content);
        } catch (error) {
          console.error("Voice transcription failed", error);
          appendMessagesToSession(recordingSessionId, [
            createMessage(
              "assistant",
              "I could not process that recording with ElevenLabs. Please try again."
            ),
          ]);
        } finally {
          audioChunksRef.current = [];
          setIsVoiceProcessing(false);
        }
      };

      recorder.start();
      setIsListening(true);
    } catch (error) {
      console.error("Microphone access failed", error);
      appendMessagesToSession(activeSessionId, [
        createMessage(
          "assistant",
          "I could not access your microphone. Please allow mic permission and try again."
        ),
      ]);
      stopMicrophoneTracks();
      setIsListening(false);
    }
  }, [activeSessionId, appendMessagesToSession, speakText, stopMicrophoneTracks, transcribeAudio]);

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsListening(false);
      return;
    }

    recorder.stop();
    setIsListening(false);
  }, []);

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
      stopMicrophoneTracks();
      stopAudioPlayback();
    };
  }, [stopAudioPlayback, stopMicrophoneTracks]);

  const sendMessage = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput || !activeSession) {
      return;
    }

    const userMessage = createMessage("user", trimmedInput);
    const aiResponse = createMessage(
      "assistant",
      "Thanks for describing that. I am tracking your journey step by step. Please continue when ready."
    );

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

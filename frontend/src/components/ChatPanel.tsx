import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Mic, MicOff, Plus } from "lucide-react";
import { format } from "date-fns";
import type { ChatMessage, ChatSession } from "@/data/sampleData";
import { sampleChatSessions } from "@/data/sampleData";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

const APP_INITIALS = "SW";

const ChatPanel = ({ open, onClose }: ChatPanelProps) => {
  const [sessions, setSessions] = useState<ChatSession[]>(sampleChatSessions);
  const [activeSessionId, setActiveSessionId] = useState(sessions[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput || !activeSession) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    };

    const aiResponse: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "I'll look into that for you. Based on our supply chain data, I can provide detailed analysis and recommendations. Would you like me to run a full supplier comparison?",
      timestamp: new Date(),
    };

    setSessions((prev) =>
      prev.map((session) =>
        session.id === activeSessionId
          ? { ...session, messages: [...session.messages, userMessage, aiResponse] }
          : session
      )
    );
    setInput("");
  }, [input, activeSession, activeSessionId]);

  const createNewChat = useCallback(() => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: "New Chat",
      date: new Date(),
      messages: [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Hi! I'm your SupplyWise assistant. How can I help you today?",
          timestamp: new Date(),
        },
      ],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleVoice = () => setIsListening((prev) => !prev);

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
          <span className="text-header-foreground font-semibold text-sm">
            SupplyWise Assistant
          </span>
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
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 text-sm bg-muted rounded-md border-0 outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="Message input"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
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

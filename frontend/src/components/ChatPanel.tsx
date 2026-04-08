import { useState, useRef, useEffect } from "react";
import { X, Send, Mic, MicOff, Plus } from "lucide-react";
import { ChatMessage, ChatSession, sampleChatSessions } from "@/data/sampleData";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ChatPanel = ({ open, onClose }: Props) => {
  const [sessions, setSessions] = useState<ChatSession[]>(sampleChatSessions);
  const [activeSessionId, setActiveSessionId] = useState(sessions[0]?.id || "");
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = () => {
    if (!input.trim() || !activeSession) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "I'll look into that for you. Based on our supply chain data, I can provide detailed analysis and recommendations. Would you like me to run a full supplier comparison?",
      timestamp: new Date(),
    };
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, messages: [...s.messages, userMsg, aiMsg] }
          : s
      )
    );
    setInput("");
  };

  const newChat = () => {
    const session: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat",
      date: new Date(),
      messages: [
        {
          id: Date.now().toString() + "-welcome",
          role: "assistant",
          content: "Hi! I'm your SupplyWise assistant. How can I help you today?",
          timestamp: new Date(),
        },
      ],
    };
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-foreground/30 md:bg-transparent" onClick={onClose} />
      <div className="relative w-full md:w-[520px] h-full bg-card shadow-2xl animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="h-14 bg-header flex items-center justify-between px-4 shrink-0">
          <span className="text-header-foreground font-semibold text-sm">SupplyWise Assistant</span>
          <button onClick={onClose} className="text-header-foreground/70 hover:text-header-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-28 md:w-32 bg-muted border-r flex flex-col shrink-0">
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSessionId(s.id)}
                  className={`w-full text-left p-2 rounded text-xs transition-colors ${
                    s.id === activeSessionId ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-background"
                  }`}
                >
                  <div className="truncate font-medium">{s.title}</div>
                  <div className="text-[10px] opacity-60">{format(s.date, "MMM d")}</div>
                </button>
              ))}
            </div>
            <button
              onClick={newChat}
              className="m-2 p-2 rounded border border-dashed border-muted-foreground/30 text-muted-foreground text-xs flex items-center justify-center gap-1 hover:bg-background transition-colors"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex items-start gap-2 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0 mt-0.5">
                        SW
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

            {/* Input */}
            <div className="border-t p-3 flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsListening(!isListening)}
                className={`p-2 rounded-full transition-colors ${
                  isListening
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              {isListening && (
                <div className="flex items-center gap-1">
                  {[...Array(4)].map((_, i) => (
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
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 text-sm bg-muted rounded-md border-0 outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={sendMessage}
                className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
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

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface Message {
  role: "user" | "model";
  text: string;
}

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const GREETINGS: Record<string, string> = {
  ar: "مرحباً! 👋 أنا مساعد AI Gateway. كيف يمكنني مساعدتك اليوم؟\n\nيمكنك سؤالي عن:\n• النماذج المتاحة\n• الأسعار والخطط\n• كيفية البدء\n• المميزات والتقنيات",
  en: "Hello! 👋 I'm the AI Gateway assistant. How can I help you today?\n\nYou can ask me about:\n• Available AI models\n• Pricing & plans\n• How to get started\n• Features & capabilities",
};

function formatText(text: string) {
  return text
    .split("\n")
    .map((line, i) => {
      const bullet = line.startsWith("•") || line.startsWith("-");
      const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      return (
        <p key={i} className={`${bullet ? "pl-2" : ""} ${i > 0 ? "mt-1" : ""}`}>
          <span dangerouslySetInnerHTML={{ __html: bold }} />
        </p>
      );
    });
}

export function ChatWidget() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
  const isRtl = lang === "ar";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show bubble hint after 4s
  useEffect(() => {
    const t = setTimeout(() => setShowBubble(true), 4000);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss bubble after 8s
  useEffect(() => {
    if (!showBubble) return;
    const t = setTimeout(() => setShowBubble(false), 8000);
    return () => clearTimeout(t);
  }, [showBubble]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const greeting = GREETINGS[lang];
      if (messages.length === 0) {
        setMessages([{ role: "model", text: greeting }]);
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const next: Message[] = [...messages, { role: "user", text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/public/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Request failed");
      }

      const data = await res.json() as { reply: string };
      setMessages([...next, { role: "model", text: data.reply }]);
    } catch (err) {
      const errorMsg = lang === "ar"
        ? "عذراً، حدث خطأ. حاول مرة أخرى."
        : "Sorry, something went wrong. Please try again.";
      setMessages([...next, { role: "model", text: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div
      className={`fixed bottom-6 z-50 ${isRtl ? "left-6" : "right-6"} flex flex-col items-end gap-2`}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Chat window */}
      {open && (
        <div
          className="w-[340px] sm:w-[380px] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: "520px", height: "520px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-sm leading-none">
                  {lang === "ar" ? "مساعد AI Gateway" : "AI Gateway Assistant"}
                </p>
                <p className="text-xs text-primary-foreground/70 mt-0.5">
                  {lang === "ar" ? "متصل الآن" : "Online now"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/10 h-7 w-7"
              onClick={() => setOpen(false)}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "model" && (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1 shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {formatText(msg.text)}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1 shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t px-3 py-2 flex gap-2 items-center bg-background">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              placeholder={lang === "ar" ? "اكتب سؤالك هنا..." : "Ask me anything..."}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
              dir={isRtl ? "rtl" : "ltr"}
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={send}
              disabled={!input.trim() || loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Hint bubble */}
      {showBubble && !open && (
        <div
          className={`bg-background border rounded-2xl px-3 py-2 shadow-lg text-sm text-foreground max-w-[200px] ${isRtl ? "rounded-bl-sm" : "rounded-br-sm"} animate-in fade-in slide-in-from-bottom-2`}
        >
          {lang === "ar" ? "👋 هل تريد معرفة المزيد؟" : "👋 Want to learn more?"}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => { setOpen((v) => !v); setShowBubble(false); }}
        className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        aria-label={lang === "ar" ? "المساعد الذكي" : "Chat assistant"}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
    </div>
  );
}

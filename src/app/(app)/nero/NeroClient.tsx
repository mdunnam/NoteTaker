"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Message { id: string; role: "user" | "assistant"; content: string; createdAt: string; }

export default function NeroClient({ initialMessages }: { initialMessages: Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/nero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const data = await res.json();
        const neroMsg: Message = { id: data.id, role: "assistant", content: data.content, createdAt: new Date().toISOString() };
        setMessages((prev) => [...prev, neroMsg]);
      }
    } catch {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "Something went wrong. Try again.", createdAt: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function clearHistory() {
    if (!confirm("Clear all conversation history?")) return;
    await fetch("/api/nero", { method: "DELETE" });
    setMessages([]);
  }

  const showEmpty = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-lg font-bold">N</div>
          <div>
            <h1 className="font-bold text-white">Nero</h1>
            <p className="text-xs text-[var(--text-muted)]">Your personal assistant</p>
          </div>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" title="Online" />
        </div>
        <button onClick={clearHistory} className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors">Clear history</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {showEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 pb-20">
            <div className="w-16 h-16 rounded-full bg-[var(--accent)] flex items-center justify-center text-3xl text-white font-bold">N</div>
            <div>
              <h2 className="text-xl font-semibold text-white">I&apos;m Nero.</h2>
              <p className="text-[var(--text-muted)] mt-1 max-w-sm">What&apos;s on your mind? I can see your tasks, habits, and projects — ask me anything or tell me what to add.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {["What do I have today?", "Add a task: call dentist", "I finished my workout", "What projects am I working on?"].map((s) => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-sm px-3 py-1.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-white transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">N</div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[var(--accent)] text-white rounded-tr-sm"
                  : "bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] rounded-tl-sm"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-li:my-0.5 prose-ul:my-1">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-sm font-bold shrink-0">N</div>
            <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 pb-6 shrink-0">
        <div className="flex gap-3 items-end bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl px-4 py-3 focus-within:border-[var(--accent)] transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Message Nero..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none resize-none"
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            ↑
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
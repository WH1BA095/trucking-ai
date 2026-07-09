"use client";

import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "../lib/api";

type Msg = { role: "user" | "assistant"; text: string };

// Placeholder until real auth exists — swap for the logged-in user's id.
const USER_ID = "demo-user";

export default function ChatWidget() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, loading]);

  async function send() {
    if (!input.trim() || loading) return;
    const text = input;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const reply = await sendChatMessage(USER_ID, text);
      setMsgs((m) => [...m, { role: "assistant", text: reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: "Something went wrong — check the backend logs." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, color: "#111827" }}>
        💬 Fleet Assistant
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, background: "#fafafa" }}>
        {msgs.length === 0 && !loading && (
          <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", marginTop: 24 }}>
            Ask about the fleet — e.g.<br />“Which trucks have fault codes?”
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ margin: "10px 0", display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <span
              style={{
                display: "inline-block",
                padding: "8px 12px",
                borderRadius: 12,
                background: m.role === "user" ? "#1F4E79" : "#fff",
                color: m.role === "user" ? "#fff" : "#111827",
                border: m.role === "user" ? "none" : "1px solid #e5e7eb",
                maxWidth: "85%",
                fontSize: 14,
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {m.text}
            </span>
          </div>
        ))}
        {loading && <div style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>Assistant is thinking…</div>}
      </div>

      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e5e7eb" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about the fleet…"
          style={{
            flex: 1,
            padding: "9px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{
            padding: "9px 16px",
            background: loading ? "#9ca3af" : "#1F4E79",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

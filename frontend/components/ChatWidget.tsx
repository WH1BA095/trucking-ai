"use client";

import { useEffect, useRef, useState } from "react";
import { sendChatMessage, fetchChatHistory } from "../lib/api";
import { useLang } from "../lib/i18n";
import { Icon } from "./icons";

type Msg = { role: "user" | "assistant"; text: string };

export default function ChatWidget() {
  const { t } = useLang();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore this user's saved conversation on mount.
  useEffect(() => {
    fetchChatHistory().then(setMsgs).catch(console.error);
  }, []);

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
      const reply = await sendChatMessage(text);
      setMsgs((m) => [...m, { role: "assistant", text: reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: t("chat.error") }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="chat" size={16} /> {t("chat.title")}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, background: "var(--panel2)" }}>
        {msgs.length === 0 && !loading && (
          <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", marginTop: 24, whiteSpace: "pre-line" }}>
            {t("chat.empty")}
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
                color: m.role === "user" ? "#fff" : "var(--text)",
                border: m.role === "user" ? "none" : "1px solid var(--border)",
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
        {loading && <div style={{ color: "var(--muted)", fontSize: 13, fontStyle: "italic" }}>{t("chat.thinking")}</div>}
      </div>

      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={t("chat.placeholder")}
          style={{
            flex: 1,
            padding: "9px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 14,
            outline: "none",
            background: "var(--panel)",
            color: "var(--text)",
          }}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{
            padding: "9px 16px",
            background: loading ? "var(--muted)" : "#1F4E79",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {t("chat.send")}
        </button>
      </div>
    </div>
  );
}

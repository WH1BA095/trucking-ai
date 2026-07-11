"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth";
import { Icon } from "./icons";

// The sign-in screen is intentionally always English (it's shown before the
// user's language preference applies, and the brand name stays English).
export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError("Invalid username or password");
    } finally {
      setBusy(false);
    }
  }

  const input: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--panel)", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "var(--bg)" }}>
      <form onSubmit={submit} style={{ width: 340, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 28, boxShadow: "0 10px 40px rgba(0,0,0,.15)" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}><Icon name="truck" size={24} /> Fleet AI Dashboard</div>
        <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20 }}>Sign in</div>

        <label style={{ fontSize: 12, color: "var(--muted)" }}>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus style={{ ...input, marginTop: 4, marginBottom: 14 }} />

        <label style={{ fontSize: 12, color: "var(--muted)" }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...input, marginTop: 4, marginBottom: 14 }} />

        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <button type="submit" disabled={busy || !username || !password}
          style={{ width: "100%", padding: "11px", background: busy ? "var(--muted)" : "#1F4E79", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

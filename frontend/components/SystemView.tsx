"use client";

import { useEffect, useState } from "react";
import {
  fetchSystemLogs, runSelfTest, clearSystemLogs, SystemLog, LOG_LEVEL_META,
} from "../lib/api";
import { useLang } from "../lib/i18n";

function LevelBadge({ level }: { level: string }) {
  const { t } = useLang();
  const meta = LOG_LEVEL_META[level] || { color: "var(--muted)", bg: "var(--panel2)" };
  return (
    <span style={{ color: meta.color, background: meta.bg, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>
      {t(`log.level.${level}`)}
    </span>
  );
}

// Backend stores naive UTC timestamps; if the string carries no timezone
// marker, treat it as UTC so the displayed time matches the wall clock.
function fmtTime(s: string | null, lang: string): string {
  if (!s) return "";
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasTz ? s : s + "Z").toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
}

function LogRow({ log }: { log: SystemLog }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const meta = LOG_LEVEL_META[log.level] || { color: "var(--muted)", bg: "transparent" };
  const hasDetails = log.details && Object.keys(log.details).length > 0;
  const when = fmtTime(log.created_at, lang);

  return (
    <div style={{ borderLeft: `3px solid ${meta.color}`, background: "var(--panel)", border: "1px solid var(--border)", borderLeftWidth: 3, borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LevelBadge level={log.level} />
        {log.component && (
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{log.component}</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{when}</span>
      </div>
      <div style={{ marginTop: 5, fontSize: 14, lineHeight: 1.45, color: "var(--text)" }}>{log.message}</div>
      {hasDetails && (
        <>
          <button onClick={() => setOpen((o) => !o)} style={{ marginTop: 8, background: "none", border: "none", color: "var(--muted)", fontSize: 12, cursor: "pointer", padding: 0 }}>
            {open ? "▾ details" : "▸ details"}
          </button>
          {open && (
            <pre style={{ marginTop: 6, background: "var(--panel2)", borderRadius: 6, padding: 12, fontSize: 12, lineHeight: 1.5, color: "var(--text)", overflow: "auto", maxHeight: 320, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {JSON.stringify(log.details, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, color, logs, empty }: { title: string; color: string; logs: SystemLog[]; empty: string }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--muted)", fontWeight: 700 }}>{title}</span>
        <span style={{ background: "var(--chip-bg)", borderRadius: 999, padding: "1px 9px", fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>{logs.length}</span>
      </div>
      {logs.length === 0 ? (
        <div style={{ padding: "14px 16px", color: "var(--muted)", fontSize: 13, background: "var(--panel)", border: "1px dashed var(--border)", borderRadius: 8 }}>{empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {logs.map((l) => <LogRow key={l.id} log={l} />)}
        </div>
      )}
    </section>
  );
}

export default function SystemView() {
  const { t } = useLang();
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    try {
      setLogs(await fetchSystemLogs());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  async function onRunSelfTest() {
    setRunning(true);
    try {
      await runSelfTest();
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  async function onClear() {
    if (!confirm(t("log.clearConfirm"))) return;
    try {
      await clearSystemLogs();
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  const scheduled = logs.filter((l) => l.kind === "scheduled_test");
  const runtime = logs.filter((l) => l.kind === "runtime_error");

  const btn: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer" };

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{t("log.title")}</div>
          <span style={{ flex: 1 }} />
          <button onClick={onRunSelfTest} disabled={running} style={{ ...btn, background: "#1F4E79", color: "#fff", border: "none", opacity: running ? 0.7 : 1 }}>
            {running ? t("log.running") : t("log.runSelfTest")}
          </button>
          <button onClick={onClear} style={btn}>{t("log.clear")}</button>
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>{t("log.loading")}</div>
        ) : (
          <>
            <Section title={t("log.scheduled")} color="#16a34a" logs={scheduled} empty={t("log.noScheduled")} />
            <Section title={t("log.runtime")} color="#dc2626" logs={runtime} empty={t("log.noRuntime")} />
          </>
        )}
      </div>
    </div>
  );
}

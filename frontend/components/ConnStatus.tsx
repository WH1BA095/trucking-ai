"use client";

import { useEffect, useRef, useState } from "react";
import { pingHealth } from "../lib/api";
import { useLang } from "../lib/i18n";

const PING_INTERVAL = 10_000; // ms between pings

// Latency buckets → phone-signal-style strength. null = request failed.
type Signal = { bars: 0 | 1 | 2 | 3; color: string; key: string };

function classify(latency: number | null): Signal {
  if (latency === null) return { bars: 0, color: "#dc2626", key: "conn.none" };
  if (latency < 300) return { bars: 3, color: "#16a34a", key: "conn.good" };
  if (latency < 1000) return { bars: 2, color: "#d97706", key: "conn.fair" };
  return { bars: 1, color: "#dc2626", key: "conn.poor" };
}

export default function ConnStatus() {
  const { t } = useLang();
  const [latency, setLatency] = useState<number | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const ms = await pingHealth();
      if (alive) setLatency(ms);
    };
    tick();
    timer.current = setInterval(tick, PING_INTERVAL);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  if (latency === undefined) return null; // before the first ping resolves

  const sig = classify(latency);
  const label = latency === null ? t("conn.none") : `${Math.round(latency)} ms · ${t(sig.key)}`;
  const heights = [7, 11, 15]; // three ascending bars

  return (
    <div
      title={label}
      style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 16, padding: "0 2px", cursor: "default" }}
    >
      {latency === null ? (
        // "No connection" — a red slashed dot
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: sig.color, fontSize: 12, fontWeight: 700 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", border: `2px solid ${sig.color}`, position: "relative", display: "inline-block" }}>
            <span style={{ position: "absolute", left: -1, top: 3, width: 11, height: 2, background: sig.color, transform: "rotate(45deg)" }} />
          </span>
        </span>
      ) : (
        heights.map((h, i) => (
          <span
            key={i}
            style={{
              width: 3.5,
              height: h,
              borderRadius: 1,
              background: i < sig.bars ? sig.color : "rgba(255,255,255,.28)",
            }}
          />
        ))
      )}
    </div>
  );
}

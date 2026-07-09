"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchReports, generateAllReports, Report, Vehicle } from "../lib/api";
import TruckDetail from "./TruckDetail";

// Change vs the previous report for the same truck, from the saved snapshots.
function deltaLine(cur: Report, prev?: Report): string | null {
  if (!prev) return null;
  const c = cur.snapshot?.details ?? {};
  const p = prev.snapshot?.details ?? {};
  const cf = cur.snapshot?.fault_codes?.length ?? 0;
  const pf = prev.snapshot?.fault_codes?.length ?? 0;
  const parts: string[] = [];
  const diff = (a: any, b: any) => (typeof a === "number" && typeof b === "number" ? a - b : null);
  const sign = (n: number) => (n > 0 ? "+" : "");

  const odo = diff(c.odometer_miles, p.odometer_miles);
  if (odo) parts.push(`${sign(odo)}${Math.round(odo).toLocaleString()} mi`);
  const hrs = diff(c.engine_hours, p.engine_hours);
  if (hrs) parts.push(`${sign(hrs)}${Math.round(hrs)} h`);
  const def = diff(c.def_percent, p.def_percent);
  if (def) parts.push(`DEF ${sign(def)}${def.toFixed(0)}%`);
  const flt = cf - pf;
  if (flt) parts.push(`faults ${sign(flt)}${flt}`);

  return parts.length ? parts.join(" · ") : "no change";
}

export default function ReportsView({ vehicles }: { vehicles: Vehicle[] }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refetch() {
    return fetchReports().then(setReports).catch(console.error);
  }

  useEffect(() => {
    refetch().finally(() => setLoading(false));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function generateAll() {
    if (generating) return;
    if (!confirm(`Generate a report for all ${vehicles.length} trucks? This runs the AI model for each and may take a minute.`)) return;
    try {
      const { count } = await generateAllReports();
      setGenerating(true);
      const baseline = reports.length;
      let ticks = 0;
      pollRef.current = setInterval(async () => {
        ticks++;
        const fresh = await fetchReports().catch(() => null);
        if (fresh) setReports(fresh);
        if ((fresh && fresh.length >= baseline + count) || ticks > 30) {
          if (pollRef.current) clearInterval(pollRef.current);
          setGenerating(false);
        }
      }, 8000);
    } catch (e) {
      console.error(e);
      alert("Couldn't start bulk generation — check the backend logs.");
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; reports: Report[] }>();
    for (const r of reports) {
      const g = map.get(r.vehicle_id) ?? { name: r.vehicle_name ?? r.vehicle_id, reports: [] };
      g.reports.push(r);
      map.set(r.vehicle_id, g);
    }
    return Array.from(map.entries()).map(([id, g]) => ({ id, ...g }));
  }, [reports]);

  const activeId = selectedId ?? groups[0]?.id ?? null;
  const activeVehicle = vehicles.find((v) => v.id === activeId) ?? null;
  const activeReports = groups.find((g) => g.id === activeId)?.reports ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <style>{`
        .report-md h1 { font-size: 18px; margin: 4px 0 10px; color: #111827; }
        .report-md h2 { font-size: 15px; margin: 16px 0 6px; color: #1f2937; }
        .report-md h3 { font-size: 14px; margin: 12px 0 4px; color: #374151; }
        .report-md p { margin: 6px 0; }
        .report-md ul { margin: 6px 0; padding-left: 20px; }
        .report-md li { margin: 2px 0; }
        .report-md table { border-collapse: collapse; margin: 10px 0; width: 100%; }
        .report-md th, .report-md td { border: 1px solid #e5e7eb; padding: 5px 9px; text-align: left; font-size: 13px; }
        .report-md th { background: #f9fafb; font-weight: 600; }
        .report-md code { background: #f3f4f6; padding: 1px 4px; border-radius: 4px; font-size: 13px; }
      `}</style>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          {reports.length} report{reports.length === 1 ? "" : "s"} · {groups.length} truck{groups.length === 1 ? "" : "s"}
        </div>
        <button
          onClick={generateAll}
          disabled={generating}
          style={{
            padding: "8px 14px",
            background: generating ? "#9ca3af" : "#1F4E79",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            cursor: generating ? "default" : "pointer",
          }}
        >
          {generating ? "Generating… (may take a minute)" : "🔄 Generate reports for all trucks"}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 24, color: "#9ca3af" }}>Loading reports…</div>
      ) : groups.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", maxWidth: 460, margin: "40px auto" }}>
          <div style={{ fontSize: 40 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginTop: 8 }}>No reports yet</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            Use “Generate reports for all trucks” above, click “Generate report” on a truck, or ask the assistant — e.g. “Make a report for truck 131”.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Truck list */}
          <div style={{ width: 260, borderRight: "1px solid #e5e7eb", overflowY: "auto", background: "#fff", flexShrink: 0 }}>
            <div style={{ padding: "12px 16px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "#9ca3af" }}>
              Trucks with reports
            </div>
            {groups.map((g) => (
              <div
                key={g.id}
                onClick={() => setSelectedId(g.id)}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  borderLeft: g.id === activeId ? "3px solid #1F4E79" : "3px solid transparent",
                  background: g.id === activeId ? "#f3f6fb" : "transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 600, color: "#111827" }}>Truck {g.name}</span>
                <span style={{ fontSize: 12, color: "#6b7280", background: "#eef2ff", borderRadius: 999, padding: "1px 8px" }}>
                  {g.reports.length}
                </span>
              </div>
            ))}
          </div>

          {/* Current info + report history */}
          <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
            {activeVehicle && (
              <div style={{ borderBottom: "8px solid #f3f4f6" }}>
                <TruckDetail vehicle={activeVehicle} onReportCreated={() => refetch()} />
              </div>
            )}
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 12 }}>
                Reports ({activeReports.length})
              </div>
              {activeReports.map((r, i) => {
                const delta = deltaLine(r, activeReports[i + 1]);
                return (
                  <div key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 14, background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontWeight: 600, color: "#111827", fontSize: 15 }}>{r.title}</span>
                      <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                      </span>
                    </div>
                    {delta && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#374151", background: "#f3f6fb", borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
                        Since previous: {delta}
                      </div>
                    )}
                    <div className="report-md" style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, marginTop: 10 }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.content}</ReactMarkdown>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchReports, generateAllReports, Report, Vehicle } from "../lib/api";
import { useLang } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { Icon } from "./icons";
import TruckDetail from "./TruckDetail";

function deltaLine(cur: Report, prev: Report | undefined, noChange: string): string | null {
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

  return parts.length ? parts.join(" · ") : noChange;
}

export default function ReportsView({ vehicles }: { vehicles: Vehicle[] }) {
  const { t, lang } = useLang();
  const { formatDateTime } = useSettings();
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
    if (!confirm(`${t("reports.generateAll")} — ${vehicles.length}?`)) return;
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
        .report-md h1 { font-size: 18px; margin: 4px 0 10px; color: var(--text); }
        .report-md h2 { font-size: 15px; margin: 16px 0 6px; color: var(--text); }
        .report-md h3 { font-size: 14px; margin: 12px 0 4px; color: var(--text); }
        .report-md p { margin: 6px 0; }
        .report-md ul { margin: 6px 0; padding-left: 20px; }
        .report-md li { margin: 2px 0; }
        .report-md table { border-collapse: collapse; margin: 10px 0; width: 100%; }
        .report-md th, .report-md td { border: 1px solid var(--border); padding: 5px 9px; text-align: left; font-size: 13px; }
        .report-md th { background: var(--panel2); font-weight: 600; }
        .report-md code { background: var(--bg); padding: 1px 4px; border-radius: 4px; font-size: 13px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {reports.length} {t("reports.reportsWord")} · {groups.length} {t("reports.trucksWord")}
        </div>
        <button
          onClick={generateAll}
          disabled={generating}
          style={{ padding: "8px 14px", background: generating ? "var(--muted)" : "#1F4E79", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: generating ? "default" : "pointer" }}
        >
          {generating ? t("reports.generatingAll") : <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="refresh" size={14} /> {t("reports.generateAll")}</span>}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 24, color: "var(--muted)" }}>{t("reports.loading")}</div>
      ) : groups.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", maxWidth: 460, margin: "40px auto" }}>
          <Icon name="report" size={40} color="var(--muted)" />
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 8 }}>{t("reports.noReportsTitle")}</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>{t("reports.noReportsHint")}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ width: 260, borderRight: "1px solid var(--border)", overflowY: "auto", background: "var(--panel)", flexShrink: 0 }}>
            <div style={{ padding: "12px 16px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)" }}>
              {t("reports.trucksWithReports")}
            </div>
            {groups.map((g) => (
              <div
                key={g.id}
                onClick={() => setSelectedId(g.id)}
                style={{ padding: "12px 16px", cursor: "pointer", borderLeft: g.id === activeId ? "3px solid #1F4E79" : "3px solid transparent", background: g.id === activeId ? "var(--panel2)" : "transparent", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{t("detail.truck")} {g.name}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", background: "var(--chip-bg)", borderRadius: 999, padding: "1px 8px" }}>{g.reports.length}</span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
            {activeVehicle && (
              <div style={{ borderBottom: "8px solid var(--bg)" }}>
                <TruckDetail vehicle={activeVehicle} onReportCreated={() => refetch()} />
              </div>
            )}
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
                {t("reports.reports")} ({activeReports.length})
              </div>
              {activeReports.map((r, i) => {
                const delta = deltaLine(r, activeReports[i + 1], t("reports.noChange"));
                const body = lang === "ru" ? r.content_ru : r.content_en;
                return (
                  <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 14, background: "var(--panel)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 15 }}>{r.title}</span>
                      <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatDateTime(r.created_at)}
                      </span>
                    </div>
                    {delta && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "var(--text)", background: "var(--panel2)", borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
                        {t("reports.sincePrevious")}: {delta}
                      </div>
                    )}
                    <div className="report-md" style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5, marginTop: 10 }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
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

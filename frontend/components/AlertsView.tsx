"use client";

import { useEffect, useState } from "react";
import { fetchAlerts, Alert, ALERT_META, FaultCode } from "../lib/api";
import { useLang } from "../lib/i18n";

function FaultLine({ f }: { f: FaultCode }) {
  const sevColor = f.severity === "high" ? "#b91c1c" : f.severity === "medium" ? "#d97706" : "#6b7280";
  return (
    <div style={{ fontSize: 13, color: "#374151", marginTop: 4, display: "flex", gap: 8, alignItems: "baseline" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: sevColor, flexShrink: 0 }} />
      <span>
        <b>{f.fault || f.description}</b>
        {f.source ? ` — ${f.source}` : ""}
        <span style={{ color: "#9ca3af", fontFamily: "ui-monospace, monospace", fontSize: 11 }}> (SPN {f.spn ?? "—"}·FMI {f.fmi ?? "—"})</span>
      </span>
    </div>
  );
}

export default function AlertsView({ onSelectTruck }: { onSelectTruck: (id: string) => void }) {
  const { t } = useLang();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => fetchAlerts().then(setAlerts).catch(console.error).finally(() => setLoading(false));
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return <div style={{ padding: 24, color: "#9ca3af" }}>{t("alerts.loading")}</div>;

  if (alerts.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", maxWidth: 420, margin: "40px auto" }}>
        <div style={{ fontSize: 40 }}>✅</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginTop: 8 }}>{t("alerts.noneTitle")}</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>{t("alerts.noneHint")}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      {alerts.map((a) => {
        const meta = ALERT_META[a.alert_level];
        const faults = Array.isArray(a.fault_codes) ? a.fault_codes : [];
        return (
          <div
            key={a.vehicle_id}
            style={{ background: meta.bg, border: `1px solid ${meta.color}33`, borderLeft: `4px solid ${meta.color}`, borderRadius: 10, padding: 16, marginBottom: 14 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  onClick={() => onSelectTruck(a.vehicle_id)}
                  style={{ fontWeight: 700, fontSize: 16, color: "#111827", cursor: "pointer", textDecoration: "underline" }}
                >
                  {t("detail.truck")} {a.name}
                </span>
                <span style={{ background: meta.color, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, textTransform: "uppercase" }}>
                  {t(`alerts.level.${a.alert_level}`)}
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: a.drivable ? "#059669" : "#b91c1c" }}>
                {a.drivable ? `🟢 ${t("alerts.drivable")}` : `🔴 ${t("alerts.notDrivable")}`}
              </span>
            </div>

            {a.location && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>📍 {a.location}</div>}
            {a.driver_name && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{t("detail.driver")}: {a.driver_name}</div>}

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "#374151" }}>
              {t("alerts.faults")} ({faults.length})
            </div>
            {faults.map((f, i) => <FaultLine key={i} f={f} />)}
          </div>
        );
      })}
    </div>
  );
}

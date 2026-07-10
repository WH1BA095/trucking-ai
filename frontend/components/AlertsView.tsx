"use client";

import { useEffect, useState } from "react";
import { fetchAlerts, Alert, ALERT_META, FaultCode } from "../lib/api";
import { useLang } from "../lib/i18n";
import { Icon, Dot } from "./icons";

function FaultLine({ f }: { f: FaultCode }) {
  const sevColor = f.severity === "high" ? "var(--fault-title)" : f.severity === "medium" ? "#d97706" : "var(--muted)";
  return (
    <div style={{ fontSize: 13, color: "var(--text)", marginTop: 4, display: "flex", gap: 8, alignItems: "baseline" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: sevColor, flexShrink: 0 }} />
      <span>
        <b>{f.fault || f.description}</b>
        {f.source ? ` — ${f.source}` : ""}
        <span style={{ color: "var(--muted)", fontFamily: "ui-monospace, monospace", fontSize: 11 }}> (SPN {f.spn ?? "—"}·FMI {f.fmi ?? "—"})</span>
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

  if (loading) return <div style={{ padding: 24, color: "var(--muted)" }}>{t("alerts.loading")}</div>;

  if (alerts.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", maxWidth: 420, margin: "40px auto" }}>
        <Icon name="check" size={40} color="#16a34a" />
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 8 }}>{t("alerts.noneTitle")}</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>{t("alerts.noneHint")}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      {alerts.map((a) => {
        const meta = ALERT_META[a.alert_level];
        const faults = Array.isArray(a.fault_codes) ? a.fault_codes : [];
        const urgent = a.drivable && a.max_severity === "high";
        const verdictColor = !a.drivable ? "var(--fault-title)" : urgent ? "#d97706" : "#16a34a";
        const verdictDot = !a.drivable ? "#dc2626" : urgent ? "#d97706" : "#16a34a";
        const verdictLabel = !a.drivable ? t("alerts.notDrivable") : urgent ? t("alerts.drivableUrgent") : t("alerts.drivable");
        const sevColor = a.max_severity === "high" ? "#dc2626" : a.max_severity === "medium" ? "#d97706" : "#6b7280";
        return (
          <div
            key={a.vehicle_id}
            style={{ background: `var(--alert-${a.alert_level}-bg)`, border: `1px solid ${meta.color}33`, borderLeft: `4px solid ${meta.color}`, borderRadius: 10, padding: 16, marginBottom: 14 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  onClick={() => onSelectTruck(a.vehicle_id)}
                  style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", cursor: "pointer", textDecoration: "underline" }}
                >
                  {t("detail.truck")} {a.name}
                </span>
                <span style={{ background: meta.color, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, textTransform: "uppercase" }}>
                  {t(`alerts.level.${a.alert_level}`)}
                </span>
                {a.max_severity && (
                  <span style={{ border: `1px solid ${sevColor}`, color: sevColor, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999 }}>
                    {t(`alerts.severity.${a.max_severity}`)}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: verdictColor, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Dot color={verdictDot} /> {verdictLabel}
              </span>
            </div>

            {a.location && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}><Icon name="pin" size={13} /> {a.location}</div>}
            {a.driver_name && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{t("detail.driver")}: {a.driver_name}</div>}

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              {t("alerts.faults")} ({faults.length})
            </div>
            {faults.map((f, i) => <FaultLine key={i} f={f} />)}
          </div>
        );
      })}
    </div>
  );
}

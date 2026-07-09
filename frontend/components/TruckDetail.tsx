"use client";

import { useEffect, useState } from "react";
import { Vehicle, FaultCode, Report, statusMeta, generateReport } from "../lib/api";
import { useLang } from "../lib/i18n";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 15, color: "var(--text)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>{children}</div>;
}

function FaultRow({ f, unknown }: { f: FaultCode; unknown: string }) {
  const sev = f.severity === "high" ? "#b91c1c" : f.severity === "medium" ? "#d97706" : "var(--muted)";
  return (
    <div style={{ border: "1px solid var(--fault-border)", background: "var(--fault-bg)", borderRadius: 8, padding: "8px 10px", marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 600, color: "var(--fault-title)", fontSize: 14 }}>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: sev, marginRight: 6 }} />
          {f.fault || f.description || "Fault"}
        </span>
        {f.count != null && <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>×{f.count}</span>}
      </div>
      {f.source && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{f.source}</div>}
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, fontFamily: "ui-monospace, monospace" }}>
        SPN {f.spn ?? unknown} · FMI {f.fmi ?? unknown}
      </div>
    </div>
  );
}

const num = (v: number | null | undefined, suffix = "", fallback = "—") =>
  v != null ? `${v.toLocaleString()}${suffix}` : fallback;

export default function TruckDetail({ vehicle, onReportCreated }: { vehicle: Vehicle | null; onReportCreated?: (report: Report) => void }) {
  const { t } = useLang();
  const [reporting, setReporting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setReporting(false);
    setDone(false);
  }, [vehicle?.id]);

  if (!vehicle) {
    return (
      <div style={{ padding: 24, color: "var(--muted)", fontSize: 14, textAlign: "center", marginTop: 40 }}>
        {t("detail.selectPrompt")}
      </div>
    );
  }

  async function handleReport() {
    if (!vehicle || reporting) return;
    setReporting(true);
    setDone(false);
    try {
      const report = await generateReport(vehicle.id);
      setDone(true);
      onReportCreated?.(report);
    } catch (e) {
      console.error(e);
      alert(t("detail.reportError"));
    } finally {
      setReporting(false);
    }
  }

  const { color, label } = statusMeta(vehicle.status);
  const faults = Array.isArray(vehicle.fault_codes) ? vehicle.fault_codes : [];
  const d = vehicle.details ?? {};
  const updated = vehicle.updated_at ? new Date(vehicle.updated_at).toLocaleTimeString() : null;

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: "var(--text)" }}>{t("detail.truck")} {vehicle.name}</h2>
        <span style={{ background: color, color: "#fff", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>{label}</span>
      </div>

      <button
        onClick={handleReport}
        disabled={reporting}
        style={{ marginTop: 14, width: "100%", padding: "10px 14px", background: reporting ? "var(--muted)" : "#1F4E79", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: reporting ? "default" : "pointer" }}
      >
        {reporting ? t("detail.generating") : `📋 ${t("detail.genReport")}`}
      </button>
      {done && <div style={{ fontSize: 13, color: "#16a34a", marginTop: 8, textAlign: "center" }}>✓ {t("detail.reportSaved")}</div>}

      <div style={{ marginTop: 18 }}>
        <Grid>
          <Field label={t("detail.driver")} value={vehicle.driver_name ?? "—"} />
          <Field label={t("detail.speed")} value={`${vehicle.speed_mph != null ? Math.round(vehicle.speed_mph) : "—"} mph`} />
          <Field label={t("detail.engine")} value={vehicle.engine_state ?? "—"} />
          <Field label={t("detail.heading")} value={vehicle.heading != null ? `${Math.round(vehicle.heading)}°` : "—"} />
        </Grid>
      </div>

      {d.location && (
        <div style={{ marginTop: 16 }}>
          <Field label={t("detail.location")} value={<span>📍 {d.location}</span>} />
        </div>
      )}

      <Section title={t("detail.telemetry")}>
        <Grid>
          <Field label={t("detail.odometer")} value={num(d.odometer_miles, " mi")} />
          <Field label={t("detail.engineHours")} value={num(d.engine_hours, " h")} />
          <Field label={t("detail.def")} value={num(d.def_percent, "%")} />
          <Field label={t("detail.coolant")} value={num(d.coolant_temp_f, "°F")} />
          <Field label={t("detail.battery")} value={num(d.battery_volts, " V")} />
          <Field label={t("detail.ambient")} value={num(d.ambient_temp_f, "°F")} />
          <Field label={t("detail.rpm")} value={num(d.engine_rpm)} />
          <Field label={t("detail.load")} value={num(d.engine_load_percent, "%")} />
        </Grid>
      </Section>

      <Section title={t("detail.vehicleInfo")}>
        <Grid>
          <Field label={t("detail.makeModel")} value={[d.make, d.model].filter(Boolean).join(" ") || "—"} />
          <Field label={t("detail.year")} value={d.year ?? "—"} />
          <Field label={t("detail.plate")} value={d.license_plate ?? "—"} />
          <Field label={t("detail.vin")} value={<span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{d.vin ?? "—"}</span>} />
        </Grid>
        {d.tags && d.tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {d.tags.map((tag) => (
              <span key={tag} style={{ background: "var(--chip-bg)", color: "var(--chip-text)", fontSize: 12, padding: "2px 8px", borderRadius: 999 }}>{tag}</span>
            ))}
          </div>
        )}
      </Section>

      <Section title={`${t("detail.faultCodes")}${faults.length ? ` (${faults.length})` : ""}`}>
        {faults.length === 0 ? (
          <div style={{ fontSize: 13, color: "#16a34a" }}>✓ {t("detail.noFaults")}</div>
        ) : (
          faults.map((f, i) => <FaultRow key={i} f={f} unknown="—" />)
        )}
      </Section>

      {vehicle.last_video_url && (
        <Section title={t("detail.dashcam")}>
          <video src={vehicle.last_video_url} controls style={{ width: "100%", borderRadius: 8 }} />
        </Section>
      )}

      {updated && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 22 }}>{t("detail.updated")} {updated}</div>}
    </div>
  );
}

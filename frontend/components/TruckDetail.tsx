"use client";

import { useEffect, useState } from "react";
import { Vehicle, FaultCode, Report, statusMeta, generateReport } from "../lib/api";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "#9ca3af" }}>
        {label}
      </div>
      <div style={{ fontSize: 15, color: "#111827", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>{children}</div>;
}

function FaultRow({ f }: { f: FaultCode }) {
  return (
    <div style={{ border: "1px solid #fee2e2", background: "#fff5f5", borderRadius: 8, padding: "8px 10px", marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 600, color: "#b91c1c", fontSize: 14 }}>{f.fault || f.description || "Fault"}</span>
        {f.count != null && <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>×{f.count}</span>}
      </div>
      {f.source && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{f.source}</div>}
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, fontFamily: "ui-monospace, monospace" }}>
        SPN {f.spn ?? "—"} · FMI {f.fmi ?? "—"}
      </div>
    </div>
  );
}

const num = (v: number | null | undefined, suffix = "", fallback = "—") =>
  v != null ? `${v.toLocaleString()}${suffix}` : fallback;

export default function TruckDetail({
  vehicle,
  onReportCreated,
}: {
  vehicle: Vehicle | null;
  onReportCreated?: (report: Report) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [done, setDone] = useState(false);

  // Reset the button state when switching to a different truck.
  useEffect(() => {
    setReporting(false);
    setDone(false);
  }, [vehicle?.id]);

  if (!vehicle) {
    return (
      <div style={{ padding: 24, color: "#9ca3af", fontSize: 14, textAlign: "center", marginTop: 40 }}>
        Select a truck on the map<br />to see its details.
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
      alert("Couldn't generate the report — check the backend logs.");
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
        <h2 style={{ margin: 0, fontSize: 22, color: "#111827" }}>Truck {vehicle.name}</h2>
        <span style={{ background: color, color: "#fff", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>
          {label}
        </span>
      </div>

      <button
        onClick={handleReport}
        disabled={reporting}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "10px 14px",
          background: reporting ? "#9ca3af" : "#1F4E79",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 14,
          cursor: reporting ? "default" : "pointer",
        }}
      >
        {reporting ? "Generating report…" : "📋 Generate report"}
      </button>
      {done && (
        <div style={{ fontSize: 13, color: "#16a34a", marginTop: 8, textAlign: "center" }}>
          ✓ Report saved — see the Reports tab
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Grid>
          <Field label="Driver" value={vehicle.driver_name ?? "—"} />
          <Field label="Speed" value={`${vehicle.speed_mph != null ? Math.round(vehicle.speed_mph) : "—"} mph`} />
          <Field label="Engine" value={vehicle.engine_state ?? "—"} />
          <Field label="Heading" value={vehicle.heading != null ? `${Math.round(vehicle.heading)}°` : "—"} />
        </Grid>
      </div>

      <Section title="Telemetry">
        <Grid>
          <Field label="Odometer" value={num(d.odometer_miles, " mi")} />
          <Field label="Engine hours" value={num(d.engine_hours, " h")} />
          <Field label="DEF level" value={num(d.def_percent, "%")} />
          <Field label="Coolant temp" value={num(d.coolant_temp_f, "°F")} />
          <Field label="Battery" value={num(d.battery_volts, " V")} />
          <Field label="Ambient temp" value={num(d.ambient_temp_f, "°F")} />
          <Field label="Engine RPM" value={num(d.engine_rpm)} />
          <Field label="Engine load" value={num(d.engine_load_percent, "%")} />
        </Grid>
      </Section>

      <Section title="Vehicle info">
        <Grid>
          <Field label="Make / Model" value={[d.make, d.model].filter(Boolean).join(" ") || "—"} />
          <Field label="Year" value={d.year ?? "—"} />
          <Field label="License plate" value={d.license_plate ?? "—"} />
          <Field label="VIN" value={<span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{d.vin ?? "—"}</span>} />
        </Grid>
        {d.tags && d.tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {d.tags.map((t) => (
              <span key={t} style={{ background: "#eef2ff", color: "#3730a3", fontSize: 12, padding: "2px 8px", borderRadius: 999 }}>{t}</span>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Fault codes${faults.length ? ` (${faults.length})` : ""}`}>
        {faults.length === 0 ? (
          <div style={{ fontSize: 13, color: "#16a34a" }}>✓ No stored fault codes</div>
        ) : (
          faults.map((f, i) => <FaultRow key={i} f={f} />)
        )}
      </Section>

      {vehicle.last_video_url && (
        <Section title="Latest dash cam">
          <video src={vehicle.last_video_url} controls style={{ width: "100%", borderRadius: 8 }} />
        </Section>
      )}

      {updated && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 22 }}>Updated {updated}</div>}
    </div>
  );
}

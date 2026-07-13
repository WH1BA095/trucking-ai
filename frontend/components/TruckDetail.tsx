"use client";

import { useEffect, useState } from "react";
import { Vehicle, FaultCode, Report, statusMeta, generateReport } from "../lib/api";
import { useLang } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { Icon } from "./icons";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 15, color: "var(--text)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Section({ title, children, defaultOpen = false }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none", fontSize: 13, fontWeight: 600, color: "var(--text)" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{title}</span>
        <Icon name="chevron" size={16} color="var(--muted)" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
      </div>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>{children}</div>;
}

function FaultRow({ f, unknown, canDrive }: { f: FaultCode; unknown: string; canDrive: boolean }) {
  const bg = canDrive ? "var(--warn-bg)" : "var(--fault-bg)";
  const bd = canDrive ? "var(--warn-border)" : "var(--fault-border)";
  const title = canDrive ? "var(--warn-title)" : "var(--fault-title)";
  return (
    <div style={{ border: `1px solid ${bd}`, background: bg, borderRadius: 8, padding: "8px 10px", marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 600, color: title, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 5 }}>
          {!canDrive && <Icon name="alert" size={13} />}
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

// US number formatting (comma thousands, period decimal) to match the US units
// used throughout (mph, miles, °F, gallons) — regardless of browser locale.
const num = (v: number | null | undefined, suffix = "", fallback = "—") =>
  v != null ? `${v.toLocaleString("en-US")}${suffix}` : fallback;

const HOS_COLOR: Record<string, string> = {
  driving: "#16a34a",
  onDuty: "#d97706",
  offDuty: "#6b7280",
  sleeperBed: "#2563eb",
};

export default function TruckDetail({ vehicle, onReportCreated, onClose }: { vehicle: Vehicle | null; onReportCreated?: (report: Report) => void; onClose?: () => void }) {
  const { t } = useLang();
  const { formatDateTime } = useSettings();
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
  const canDrive = d.drivable !== false;
  const updated = vehicle.updated_at ? formatDateTime(vehicle.updated_at) : null;

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 22, color: "var(--text)" }}>{t("detail.truck")} {vehicle.name}</h2>
          <span style={{ background: color, color: "#fff", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>{label}</span>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="close" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex", padding: 4 }}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      <button
        onClick={handleReport}
        disabled={reporting}
        style={{ marginTop: 14, width: "100%", padding: "10px 14px", background: reporting ? "var(--muted)" : "#1F4E79", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: reporting ? "default" : "pointer" }}
      >
        {reporting ? t("detail.generating") : <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="report" size={15} /> {t("detail.genReport")}</span>}
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
          <Field label={t("detail.location")} value={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="pin" size={14} /> {d.location}</span>} />
        </div>
      )}

      {d.hos && (
        <Section
          title={
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{t("detail.hos")}</span>
              {d.hos.violation && (
                <span style={{ background: "var(--fault-title)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999 }}>{t("hos.violation")}</span>
              )}
            </span>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <Field
              label={t("hos.duty")}
              value={
                <span style={{ color: HOS_COLOR[d.hos.status ?? ""] ?? "var(--text)", fontWeight: 600 }}>
                  {d.hos.status ? t(`hos.status.${d.hos.status}`) : "—"}
                </span>
              }
            />
          </div>
          <Grid>
            <Field label={t("hos.drive")} value={num(d.hos.drive_remaining_h, " h")} />
            <Field label={t("hos.shift")} value={num(d.hos.shift_remaining_h, " h")} />
            <Field label={t("hos.cycle")} value={num(d.hos.cycle_remaining_h, " h")} />
            <Field label={t("hos.break")} value={num(d.hos.break_in_h, " h")} />
          </Grid>
        </Section>
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

      {d.fuel && (
        <Section
          title={
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{t("detail.fuel")}</span>
              {d.fuel.period_days != null && (
                <span style={{ background: "var(--chip-bg)", color: "var(--chip-text)", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
                  {d.fuel.period_days}{t("detail.days")}
                </span>
              )}
            </span>
          }
        >
          <Grid>
            <Field label={t("detail.fuelLevel")} value={num(d.fuel.level_percent, "%")} />
            <Field
              label={t("detail.fuelRemaining")}
              value={
                d.fuel.remaining_gallons != null
                  ? d.fuel.tank_gallons
                    ? `${d.fuel.remaining_gallons.toLocaleString("en-US")} / ${d.fuel.tank_gallons.toLocaleString("en-US")} gal`
                    : `${d.fuel.remaining_gallons.toLocaleString("en-US")} gal`
                  : "—"
              }
            />
            <Field label={t("detail.fuelMpg")} value={num(d.fuel.mpg, " mpg")} />
            <Field label={t("detail.fuelUsed")} value={num(d.fuel.gallons, " gal")} />
            <Field label={t("detail.fuelCost")} value={d.fuel.cost_usd != null ? `$${d.fuel.cost_usd.toLocaleString("en-US")}` : "—"} />
            <Field label={t("detail.fuelDistance")} value={num(d.fuel.miles, " mi")} />
            <Field label={t("detail.fuelIdle")} value={num(d.fuel.idle_pct, "%")} />
          </Grid>
        </Section>
      )}

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

      <Section
        title={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{t("detail.faultCodes")}{faults.length ? ` (${faults.length})` : ""}</span>
            {faults.length > 0 && (
              <span style={{ background: canDrive ? "var(--warn-title)" : "var(--fault-title)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 5 }}>
                {!canDrive && <Icon name="alert" size={12} />}
                {canDrive ? t("detail.driveOk") : t("detail.driveNo")}
              </span>
            )}
          </span>
        }
        defaultOpen={faults.length > 0}
      >
        {faults.length === 0 ? (
          <div style={{ fontSize: 13, color: "#16a34a" }}>✓ {t("detail.noFaults")}</div>
        ) : (
          faults.map((f, i) => <FaultRow key={i} f={f} unknown="—" canDrive={canDrive} />)
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

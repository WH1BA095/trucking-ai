"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchVehicles, fetchRoute, Vehicle, STATUS_META } from "../lib/api";
import { useLang } from "../lib/i18n";
import TruckDetail from "../components/TruckDetail";
import ChatWidget from "../components/ChatWidget";
import ReportsView from "../components/ReportsView";
import AlertsView from "../components/AlertsView";

// Leaflet touches `window`, so it must be loaded client-side only.
const TruckMap = dynamic(() => import("../components/TruckMap"), { ssr: false });

type Tab = "map" | "reports" | "alerts";

function Metric({ label, value, color, active, onClick }: { label: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer",
        borderRadius: 999, padding: "3px 10px", background: active ? color : "transparent", transition: "background .15s",
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: active ? "#fff" : color, display: "inline-block" }} />
      <span style={{ fontWeight: 700, fontSize: 15, color: active ? "#fff" : "#111827" }}>{value}</span>
      <span style={{ color: active ? "rgba(255,255,255,.85)" : "#9ca3af", fontSize: 13 }}>{label}</span>
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(255,255,255,.18)" : "transparent", color: "#fff", border: "none",
        padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export default function Home() {
  const { t, lang, setLang } = useLang();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [tab, setTab] = useState<Tab>("map");
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) {
      setRoute([]);
      return;
    }
    let active = true;
    fetchRoute(selected.id).then((pts) => active && setRoute(pts)).catch(() => active && setRoute([]));
    return () => {
      active = false;
    };
  }, [selected?.id]);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchVehicles();
        setVehicles(data);
        setSelected((prev) => (prev ? data.find((v) => v.id === prev.id) ?? prev : prev));
      } catch (e) {
        console.error(e);
      }
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const count = (s: string) => vehicles.filter((v) => v.status === s).length;
  const shown = filter ? vehicles.filter((v) => v.status === filter) : vehicles;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f3f4f6" }}>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", height: 56, background: "#1F4E79", color: "#fff", flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>🚛 {t("app.title")}</div>
          <div style={{ display: "flex", gap: 4 }}>
            <TabButton active={tab === "map"} onClick={() => setTab("map")}>{t("tab.map")}</TabButton>
            <TabButton active={tab === "reports"} onClick={() => setTab("reports")}>{t("tab.reports")}</TabButton>
            <TabButton active={tab === "alerts"} onClick={() => setTab("alerts")}>{t("tab.alerts")}</TabButton>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {filter && (
            <button
              onClick={() => setFilter(null)}
              style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.5)", borderRadius: 999, padding: "5px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              ✕ {t("filter.reset")}
            </button>
          )}
          <div style={{ display: "flex", gap: 4, background: "#fff", padding: "3px 6px", borderRadius: 999 }}>
            <Metric label={t("metric.total")} value={vehicles.length} color="#1F4E79" active={filter === null} onClick={() => setFilter(null)} />
            <Metric label={t("metric.moving")} value={count("moving")} color={STATUS_META.moving.color} active={filter === "moving"} onClick={() => setFilter("moving")} />
            <Metric label={t("metric.idle")} value={count("idle")} color={STATUS_META.idle.color} active={filter === "idle"} onClick={() => setFilter("idle")} />
            <Metric label={t("metric.fault")} value={count("fault")} color={STATUS_META.fault.color} active={filter === "fault"} onClick={() => setFilter("fault")} />
          </div>
          <button
            onClick={() => setLang(lang === "en" ? "ru" : "en")}
            style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.4)", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            {lang === "en" ? "RU" : "EN"}
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
          {tab === "map" ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TruckMap vehicles={shown} selectedId={selected?.id ?? null} route={route} onSelect={setSelected} />
              </div>
              <div style={{ width: 340, background: "#fff", borderLeft: "1px solid #e5e7eb", flexShrink: 0 }}>
                <TruckDetail vehicle={selected} onReportCreated={() => setTab("reports")} />
              </div>
            </>
          ) : tab === "reports" ? (
            <div style={{ flex: 1, minWidth: 0, background: "#f3f4f6" }}>
              <ReportsView vehicles={vehicles} />
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 0, background: "#f3f4f6" }}>
              <AlertsView onSelectTruck={(id) => { const v = vehicles.find((x) => x.id === id); if (v) { setSelected(v); setTab("map"); } }} />
            </div>
          )}
        </div>
        <div style={{ width: tab === "alerts" ? 520 : 360, background: "#fff", borderLeft: "1px solid #e5e7eb", flexShrink: 0, transition: "width .2s" }}>
          <ChatWidget />
        </div>
      </div>
    </div>
  );
}

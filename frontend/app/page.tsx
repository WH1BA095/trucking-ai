"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchVehicles, fetchRoute, Vehicle, STATUS_META, hasAlert } from "../lib/api";
import { useLang } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { useSettings, TIMEZONES } from "../lib/settings";
import { useAuth } from "../lib/auth";
import TruckDetail from "../components/TruckDetail";
import ChatWidget from "../components/ChatWidget";
import ReportsView from "../components/ReportsView";
import AlertsView from "../components/AlertsView";
import AdminView from "../components/AdminView";
import ProfileView from "../components/ProfileView";
import Login from "../components/Login";
import { Icon } from "../components/icons";

// Leaflet touches `window`, so it must be loaded client-side only.
const TruckMap = dynamic(() => import("../components/TruckMap"), { ssr: false });

type Tab = "map" | "reports" | "alerts" | "admin";
const TAB_PERM: Record<Tab, string> = { map: "view_map", reports: "view_reports", alerts: "view_alerts", admin: "view_db" };
const ALL_TABS: Tab[] = ["map", "reports", "alerts", "admin"];

function Metric({ label, value, color, active, onClick }: { label: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer", borderRadius: 999, padding: "3px 10px", background: active ? color : "transparent", transition: "background .15s" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: active ? "#fff" : color, display: "inline-block" }} />
      <span style={{ fontWeight: 700, fontSize: 15, color: active ? "#fff" : "var(--text)" }}>{value}</span>
      <span style={{ color: active ? "rgba(255,255,255,.85)" : "var(--muted)", fontSize: 13 }}>{label}</span>
    </button>
  );
}

function Clock() {
  const { formatClock } = useSettings();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const { date, time, zone } = formatClock(now);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.12)", padding: "4px 12px", borderRadius: 8, color: "#fff", fontSize: 13 }}>
      <span>{date}</span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, letterSpacing: 0.5 }}>{time}</span>
      <span style={{ opacity: 0.7 }}>{zone}</span>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ background: active ? "rgba(255,255,255,.18)" : "transparent", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
      {children}
    </button>
  );
}

const ctrlBtn: React.CSSProperties = { background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.4)", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer" };

export default function Home() {
  const { t, lang, setLang } = useLang();
  const { theme, toggle } = useTheme();
  const { timeZone, setTimeZone, hour12, setHour12 } = useSettings();
  const { user, loading, logout, hasPerm } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [tab, setTab] = useState<Tab>("map");
  const [filter, setFilter] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const allowedTabs = ALL_TABS.filter((tb) => hasPerm(TAB_PERM[tb]));

  useEffect(() => {
    if (user && allowedTabs.length && !allowedTabs.includes(tab)) setTab(allowedTabs[0]);
  }, [user]);

  useEffect(() => {
    if (!selected) {
      setRoute([]);
      return;
    }
    let active = true;
    fetchRoute(selected.id).then((pts) => active && setRoute(pts)).catch(() => active && setRoute([]));
    return () => { active = false; };
  }, [selected?.id]);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  if (loading) return <div style={{ height: "100vh", background: "var(--bg)" }} />;
  if (!user) return <Login />;

  const count = (s: string) => vehicles.filter((v) => v.status === s).length;
  const faultCount = vehicles.filter(hasAlert).length;
  const shown = !filter
    ? vehicles
    : filter === "fault"
    ? vehicles.filter(hasAlert)
    : vehicles.filter((v) => v.status === filter);
  const chatWidth = tab === "alerts" ? 520 : tab === "map" && !selected ? 560 : 360;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 56, background: "#1F4E79", color: "#fff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}><Icon name="truck" size={18} /> {t("app.title")}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {allowedTabs.map((tb) => (
              <TabButton key={tb} active={tab === tb && !profileOpen} onClick={() => { setTab(tb); setProfileOpen(false); }}>{t(`tab.${tb}`)}</TabButton>
            ))}
          </div>
          <Clock />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!profileOpen && tab === "map" && (
            <div style={{ display: "flex", gap: 4, background: "var(--panel)", padding: "3px 6px", borderRadius: 999 }}>
              <Metric label={t("metric.total")} value={vehicles.length} color="#1F4E79" active={filter === null} onClick={() => setFilter(null)} />
              <Metric label={t("metric.moving")} value={count("moving")} color={STATUS_META.moving.color} active={filter === "moving"} onClick={() => setFilter("moving")} />
              <Metric label={t("metric.idle")} value={count("idle")} color={STATUS_META.idle.color} active={filter === "idle"} onClick={() => setFilter("idle")} />
              <Metric label={t("metric.fault")} value={faultCount} color={STATUS_META.fault.color} active={filter === "fault"} onClick={() => setFilter("fault")} />
            </div>
          )}
          <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)} title="Time zone" style={{ ...ctrlBtn, fontWeight: 400 }}>
            {TIMEZONES.map((tz) => <option key={tz.id} value={tz.id} style={{ color: "#111827" }}>{tz.label}</option>)}
          </select>
          <button onClick={() => setHour12(!hour12)} title="12 / 24 hour" style={ctrlBtn}>{hour12 ? "12h" : "24h"}</button>
          <button onClick={() => setLang(lang === "en" ? "ru" : "en")} style={ctrlBtn}>{lang === "en" ? "RU" : "EN"}</button>
          <button onClick={toggle} title="Toggle theme" style={{ ...ctrlBtn, display: "flex", alignItems: "center" }}><Icon name={theme === "light" ? "moon" : "sun"} size={15} /></button>

          {/* Account */}
          <button onClick={() => setProfileOpen(true)} title={t("profile.title")} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.4)", borderRadius: 999, padding: "3px 10px 3px 3px", color: "#fff", cursor: "pointer" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,.25)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              {user.avatar ? <img src={user.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="user" size={15} />}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{user.username}</span>
          </button>
          <button onClick={logout} title={t("auth.logout")} style={{ ...ctrlBtn, display: "flex", alignItems: "center" }}><Icon name="logout" size={15} /></button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {profileOpen ? (
          <div style={{ flex: 1, minWidth: 0, background: "var(--bg)" }}>
            <ProfileView onClose={() => setProfileOpen(false)} />
          </div>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
              {tab === "map" ? (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TruckMap vehicles={shown} selectedId={selected?.id ?? null} route={route} onSelect={setSelected} />
                  </div>
                  {/* Detail panel slides in from the right when a truck is selected */}
                  <div style={{ width: selected ? 340 : 0, flexShrink: 0, overflow: "hidden", transition: "width .25s ease", display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ width: 340, height: "100%", background: "var(--panel)", borderLeft: "1px solid var(--border)" }}>
                      <TruckDetail vehicle={selected} onReportCreated={() => setTab("reports")} onClose={() => setSelected(null)} />
                    </div>
                  </div>
                </>
              ) : tab === "reports" ? (
                <div style={{ flex: 1, minWidth: 0, background: "var(--bg)" }}><ReportsView vehicles={vehicles} /></div>
              ) : tab === "alerts" ? (
                <div style={{ flex: 1, minWidth: 0, background: "var(--bg)" }}>
                  <AlertsView onSelectTruck={(id) => { const v = vehicles.find((x) => x.id === id); if (v) { setSelected(v); setTab("map"); } }} />
                </div>
              ) : (
                <div style={{ flex: 1, minWidth: 0, background: "var(--bg)" }}><AdminView /></div>
              )}
            </div>
            {tab !== "admin" && (
              <div style={{ width: chatWidth, background: "var(--panel)", borderLeft: "1px solid var(--border)", flexShrink: 0, transition: "width .25s ease" }}>
                <ChatWidget />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

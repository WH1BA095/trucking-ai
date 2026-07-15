"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchVehicles, fetchRoute, Vehicle, STATUS_META, hasAlert } from "../lib/api";
import { useLang } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { useAuth } from "../lib/auth";
import { useIsMobile } from "../lib/useIsMobile";
import TruckDetail from "../components/TruckDetail";
import ChatWidget from "../components/ChatWidget";
import ReportsView from "../components/ReportsView";
import AlertsView from "../components/AlertsView";
import ProfileView from "../components/ProfileView";
import Login from "../components/Login";
import ConnStatus from "../components/ConnStatus";
import { Icon } from "../components/icons";

// Leaflet touches `window`, so it must be loaded client-side only.
const TruckMap = dynamic(() => import("../components/TruckMap"), { ssr: false });

// Note: the DB viewer and the system journal (Logs / Tests) are intentionally
// NOT top-nav tabs — they live inside the profile/account view so they're out
// of sight for casual use.
type Tab = "map" | "reports" | "alerts";
const TAB_PERM: Record<Tab, string> = { map: "view_map", reports: "view_reports", alerts: "view_alerts" };
const ALL_TABS: Tab[] = ["map", "reports", "alerts"];

// Full-screen views that live outside the tabs (reached from the profile).
type View = null | "profile" | "db" | "logs";

// The app is a single Next route, so navigation state is mirrored in the query
// string by hand. Without this the browser's back/forward buttons have nothing
// to step through and just leave the app.
function navToUrl(tab: Tab, view: View, truck: string | null): string {
  const p = new URLSearchParams();
  if (view) {
    p.set("view", view);
  } else {
    p.set("tab", tab);
    if (truck) p.set("truck", truck);
  }
  return `${window.location.pathname}?${p.toString()}`;
}

function parseNav(search: string): { tab: Tab; view: View; truck: string | null } {
  const p = new URLSearchParams(search);
  const tab = p.get("tab");
  const view = p.get("view");
  return {
    tab: (ALL_TABS as string[]).includes(tab ?? "") ? (tab as Tab) : "map",
    view: view === "profile" || view === "db" || view === "logs" ? view : null,
    truck: p.get("truck"),
  };
}

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

// Truck search — narrows the markers on the map. The header metrics stay
// fleet-wide on purpose: they're the totals, and double as status filters.
function SearchBox({ value, onChange, placeholder, width }: { value: string; onChange: (v: string) => void; placeholder: string; width: number | string }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <input
        className="hdr-search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width, boxSizing: "border-box", padding: "6px 26px 6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.4)", background: "rgba(255,255,255,.15)", color: "#fff", fontSize: 13, outline: "none" }}
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Clear search"
          style={{ position: "absolute", right: 5, background: "none", border: "none", color: "rgba(255,255,255,.85)", cursor: "pointer", display: "flex", padding: 2 }}>
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

export default function Home() {
  const { t } = useLang();
  const { user, loading, logout, hasPerm } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [tab, setTab] = useState<Tab>("map");
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>(null);
  const [chatOpen, setChatOpen] = useState(false); // mobile: chat is a full-screen overlay
  const [hydrated, setHydrated] = useState(false); // URL read; safe to start pushing history
  const isMobile = useIsMobile();

  // Derived from the live list, so the open truck panel always shows fresh data.
  const selected = vehicles.find((v) => v.id === selectedId) ?? null;
  const allowedTabs = ALL_TABS.filter((tb) => hasPerm(TAB_PERM[tb]));

  // --- browser history ---
  // Read the URL on mount and on every back/forward, and mirror navigation back
  // into it as the user moves around.
  useEffect(() => {
    const apply = () => {
      const n = parseNav(window.location.search);
      setTab(n.tab);
      setView(n.view);
      setSelectedId(n.truck);
    };
    apply();
    // Normalize "/" to "/?tab=map" up front so the first real navigation pushes
    // a genuinely new entry instead of rewriting this one.
    const n = parseNav(window.location.search);
    window.history.replaceState(null, "", navToUrl(n.tab, n.view, n.truck));
    setHydrated(true);
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  // After a popstate the state already matches the URL, so this pushes nothing —
  // it only fires for navigation the user does inside the app.
  const navKey = `${tab}|${view}|${selectedId}`;
  useEffect(() => {
    if (!hydrated) return;
    const url = navToUrl(tab, view, selectedId);
    if (url !== window.location.pathname + window.location.search) {
      window.history.pushState(null, "", url);
    }
  }, [navKey, hydrated]);

  useEffect(() => {
    if (user && allowedTabs.length && !allowedTabs.includes(tab)) setTab(allowedTabs[0]);
  }, [user]);

  useEffect(() => {
    if (!selectedId) {
      setRoute([]);
      return;
    }
    let active = true;
    fetchRoute(selectedId).then((pts) => active && setRoute(pts)).catch(() => active && setRoute([]));
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        setVehicles(await fetchVehicles());
      } catch (e) {
        console.error(e);
      }
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading) return <div style={{ height: "100%", background: "var(--bg)" }} />;
  if (!user) return <Login />;

  const count = (s: string) => vehicles.filter((v) => v.status === s).length;
  const faultCount = vehicles.filter(hasAlert).length;

  // Search matches the truck number first, but also driver / VIN / plate so you
  // can find a truck by whatever you happen to know.
  const q = search.trim().toLowerCase();
  const matchesSearch = (v: Vehicle) => {
    if (!q) return true;
    const d = v.details ?? {};
    return [v.name, v.driver_name, d.vin, d.license_plate]
      .some((field) => (field ?? "").toString().toLowerCase().includes(q));
  };

  const byStatus = !filter
    ? vehicles
    : filter === "fault"
    ? vehicles.filter(hasAlert)
    : vehicles.filter((v) => v.status === filter);
  const shown = byStatus.filter(matchesSearch);
  const chatWidth = tab === "alerts" ? 520 : tab === "map" && !selected ? 560 : 360;

  const profileSub = view === "db" || view === "logs" ? view : null;
  const profileProps = {
    onClose: () => setView(null),
    sub: profileSub,
    onSub: (s: "db" | "logs" | null) => setView(s ?? "profile"),
  };

  const mainContent =
    tab === "map" ? (
      <TruckMap vehicles={shown} selectedId={selectedId} route={route} onSelect={(v) => setSelectedId(v.id)} searchKey={q} />
    ) : tab === "reports" ? (
      <ReportsView vehicles={vehicles} />
    ) : (
      <AlertsView onSelectTruck={(id) => { setSelectedId(id); setTab("map"); }} />
    );

  // --- Phone layout: single column, chat + truck detail as full-screen overlays ---
  if (isMobile) {
    if (view) {
      return <div style={{ height: "100%", background: "var(--bg)" }}><ProfileView {...profileProps} /></div>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)", position: "relative" }}>
        <header style={{ background: "#1F4E79", color: "#fff", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px", height: 48 }}>
            <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}><Icon name="truck" size={18} /> Fleet AI</div>
            <div style={{ flex: 1 }} />
            <ConnStatus />
            <button onClick={() => setView("profile")} title={t("profile.title")} style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.4)", borderRadius: "50%", padding: 3, color: "#fff", cursor: "pointer" }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,.25)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {user.avatar ? <img src={user.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="user" size={15} />}
              </span>
            </button>
            <button onClick={logout} title={t("auth.logout")} style={{ ...ctrlBtn, display: "flex", alignItems: "center", padding: 7 }}><Icon name="logout" size={15} /></button>
          </div>
          <div style={{ display: "flex", gap: 4, padding: "0 8px 8px", overflowX: "auto" }}>
            {allowedTabs.map((tb) => (
              <TabButton key={tb} active={tab === tb} onClick={() => setTab(tb)}>{t(`tab.${tb}`)}</TabButton>
            ))}
          </div>
          {tab === "map" && (
            <div style={{ padding: "0 8px 8px" }}>
              <SearchBox value={search} onChange={setSearch} placeholder={t("search.truck")} width="100%" />
            </div>
          )}
        </header>

        <div style={{ flex: 1, minHeight: 0 }}>{mainContent}</div>

        {/* Truck detail as a full-screen overlay */}
        {tab === "map" && selected && (
          <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--panel)" }}>
            <TruckDetail vehicle={selected} onReportCreated={() => { setSelectedId(null); setTab("reports"); }} onClose={() => setSelectedId(null)} />
          </div>
        )}

        {/* Chat: floating button → full-screen overlay */}
        {!chatOpen && (
          <button onClick={() => setChatOpen(true)} aria-label={t("chat.title")}
            style={{ position: "fixed", right: 16, bottom: 16, zIndex: 900, width: 52, height: 52, borderRadius: "50%", background: "#1F4E79", color: "#fff", border: "none", boxShadow: "0 4px 14px rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Icon name="chat" size={22} />
          </button>
        )}
        {chatOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "var(--panel)", display: "flex", flexDirection: "column" }}>
            <button onClick={() => setChatOpen(false)} aria-label="Close"
              style={{ position: "absolute", top: 10, right: 12, zIndex: 2, background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 8, padding: 6, color: "var(--text)", cursor: "pointer", display: "flex" }}>
              <Icon name="close" size={18} />
            </button>
            <div style={{ flex: 1, minHeight: 0 }}><ChatWidget /></div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 56, background: "#1F4E79", color: "#fff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}><Icon name="truck" size={18} /> {t("app.title")}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {allowedTabs.map((tb) => (
              <TabButton key={tb} active={tab === tb && !view} onClick={() => { setTab(tb); setView(null); }}>{t(`tab.${tb}`)}</TabButton>
            ))}
          </div>
          <Clock />
          <ConnStatus />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!view && tab === "map" && (
            <SearchBox value={search} onChange={setSearch} placeholder={t("search.truck")} width={200} />
          )}
          {!view && tab === "map" && (
            <div style={{ display: "flex", gap: 4, background: "var(--panel)", padding: "3px 6px", borderRadius: 999 }}>
              <Metric label={t("metric.total")} value={vehicles.length} color="#1F4E79" active={filter === null} onClick={() => setFilter(null)} />
              <Metric label={t("metric.moving")} value={count("moving")} color={STATUS_META.moving.color} active={filter === "moving"} onClick={() => setFilter("moving")} />
              <Metric label={t("metric.idle")} value={count("idle")} color={STATUS_META.idle.color} active={filter === "idle"} onClick={() => setFilter("idle")} />
              <Metric label={t("metric.fault")} value={faultCount} color={STATUS_META.fault.color} active={filter === "fault"} onClick={() => setFilter("fault")} />
            </div>
          )}
          {/* Account (timezone / 12-24h / language / theme moved to profile settings) */}
          <button onClick={() => setView("profile")} title={t("profile.title")} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.4)", borderRadius: 999, padding: "3px 10px 3px 3px", color: "#fff", cursor: "pointer" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,.25)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              {user.avatar ? <img src={user.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="user" size={15} />}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{user.username}</span>
          </button>
          <button onClick={logout} title={t("auth.logout")} style={{ ...ctrlBtn, display: "flex", alignItems: "center" }}><Icon name="logout" size={15} /></button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {view ? (
          <div style={{ flex: 1, minWidth: 0, background: "var(--bg)" }}>
            <ProfileView {...profileProps} />
          </div>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
              {tab === "map" ? (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TruckMap vehicles={shown} selectedId={selectedId} route={route} onSelect={(v) => setSelectedId(v.id)} searchKey={q} />
                  </div>
                  {/* Detail panel slides in from the right when a truck is selected */}
                  <div style={{ width: selected ? 340 : 0, flexShrink: 0, overflow: "hidden", transition: "width .25s ease", display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ width: 340, height: "100%", background: "var(--panel)", borderLeft: "1px solid var(--border)" }}>
                      <TruckDetail vehicle={selected} onReportCreated={() => setTab("reports")} onClose={() => setSelectedId(null)} />
                    </div>
                  </div>
                </>
              ) : tab === "reports" ? (
                <div style={{ flex: 1, minWidth: 0, background: "var(--bg)" }}><ReportsView vehicles={vehicles} /></div>
              ) : (
                <div style={{ flex: 1, minWidth: 0, background: "var(--bg)" }}>
                  <AlertsView onSelectTruck={(id) => { setSelectedId(id); setTab("map"); }} />
                </div>
              )}
            </div>
            <div style={{ width: chatWidth, background: "var(--panel)", borderLeft: "1px solid var(--border)", flexShrink: 0, transition: "width .25s ease" }}>
              <ChatWidget />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

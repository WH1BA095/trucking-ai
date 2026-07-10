"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useLang } from "./i18n";

export const TIMEZONES = [
  { id: "America/New_York", label: "US Eastern" },
  { id: "America/Chicago", label: "US Central (IL)" },
  { id: "America/Denver", label: "US Mountain" },
  { id: "America/Los_Angeles", label: "US Pacific" },
  { id: "America/Phoenix", label: "US Arizona" },
  { id: "Europe/Moscow", label: "Moscow" },
];

const DEFAULT_TZ = "America/Chicago"; // Illinois / Central

// Backend stores naive UTC (datetime.utcnow) — if the ISO string has no zone,
// treat it as UTC so it isn't misread as browser-local time.
function parseUTC(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}

type Ctx = {
  timeZone: string;
  setTimeZone: (tz: string) => void;
  hour12: boolean;
  setHour12: (v: boolean) => void;
  formatDateTime: (iso: string | null | undefined) => string;
  formatTime: (iso: string | null | undefined) => string;
  formatClock: (d: Date) => { date: string; time: string; zone: string };
};

const SettingsContext = createContext<Ctx>({} as Ctx);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const [timeZone, setTZ] = useState(DEFAULT_TZ);
  const [hour12, setH12] = useState(false);

  useEffect(() => {
    const tz = localStorage.getItem("timeZone");
    const h12 = localStorage.getItem("hour12");
    if (tz) setTZ(tz);
    if (h12 != null) setH12(h12 === "true");
  }, []);

  const setTimeZone = (tz: string) => {
    setTZ(tz);
    localStorage.setItem("timeZone", tz);
  };
  const setHour12 = (v: boolean) => {
    setH12(v);
    localStorage.setItem("hour12", String(v));
  };

  const formatDateTime = (iso: string | null | undefined) =>
    iso ? parseUTC(iso).toLocaleString(locale, {
      timeZone, hour12, year: "2-digit", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }) : "—";

  const formatTime = (iso: string | null | undefined) =>
    iso ? parseUTC(iso).toLocaleTimeString(locale, {
      timeZone, hour12, hour: "2-digit", minute: "2-digit", second: "2-digit",
    }) : "—";

  const formatClock = (d: Date) => ({
    date: d.toLocaleDateString(locale, { timeZone, weekday: "short", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(locale, { timeZone, hour12, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    zone: (d.toLocaleTimeString("en-US", { timeZone, timeZoneName: "short" }).split(" ").pop() || ""),
  });

  return (
    <SettingsContext.Provider value={{ timeZone, setTimeZone, hour12, setHour12, formatDateTime, formatTime, formatClock }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

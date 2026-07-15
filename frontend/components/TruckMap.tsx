"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Vehicle, statusMeta, hasAlert } from "../lib/api";
import { useLang } from "../lib/i18n";

// Truck glyph inside a circle. Moving trucks get a white, slightly raised badge;
// stopped ones are gray. A red "!" badge marks an active fault lamp, so faults
// are shown independently of whether the truck is moving.
const truckSvg = (fill: string) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="${fill}"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-5l-3-4zM6 18.5A1.5 1.5 0 1 1 7.5 17 1.5 1.5 0 0 1 6 18.5zM19.5 9.5l1.96 2.5H17V9.5zM18 18.5A1.5 1.5 0 1 1 19.5 17 1.5 1.5 0 0 1 18 18.5z"/></svg>`;

function truckIcon(v: Vehicle, selected: boolean, alert: boolean) {
  const moving = v.status === "moving";
  const bg = moving ? "#ffffff" : "#9ca3af";
  const glyph = moving ? "#334155" : "#ffffff";
  const border = selected ? "#111827" : moving ? "#d1d5db" : "#ffffff";
  const badge = alert
    ? `<div style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:#dc2626;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font:800 11px system-ui;line-height:1;">!</div>`
    : "";
  // Number label sits below the circle and on top (z-index) so it isn't hidden
  // behind the icon or a neighbouring marker.
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="position:relative;">
        <div style="
          background:${bg};
          width:30px;height:30px;
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 6px rgba(0,0,0,.35);
          border:2px solid ${border};
        ">${truckSvg(glyph)}</div>
        ${badge}
      </div>
      <span style="
        position:relative;z-index:1000;
        margin-top:2px;
        background:#fff;color:#111827;
        font:600 9px system-ui;
        padding:0 4px;border-radius:4px;
        box-shadow:0 1px 2px rgba(0,0,0,.3);
        white-space:nowrap;
      ">${v.name}</span>
    </div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 16],
    popupAnchor: [0, -18],
  });
}

// Fit the map to the whole fleet once, on first load — but don't yank the view
// on every 30s refresh, so the user's manual zoom/pan is preserved.
function FitToFleet({ points }: { points: [number, number][] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!done.current && points.length) {
      map.fitBounds(points, { padding: [50, 50] });
      done.current = true;
    }
  }, [points, map]);
  return null;
}

// Zoom to whatever the search narrowed us down to. Deliberately keyed on the
// query alone: it must not re-fit on every 30s position refresh, only when the
// user actually changes what they're searching for.
function FitToSearch({ points, searchKey }: { points: [number, number][]; searchKey: string }) {
  const map = useMap();
  const latest = useRef(points);
  latest.current = points;
  useEffect(() => {
    if (searchKey && latest.current.length) {
      map.fitBounds(latest.current, { padding: [80, 80], maxZoom: 12 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, map]);
  return null;
}

export default function TruckMap({
  vehicles,
  selectedId,
  route,
  onSelect,
  searchKey = "",
}: {
  vehicles: Vehicle[];
  selectedId: string | null;
  route?: [number, number][];
  onSelect: (v: Vehicle) => void;
  searchKey?: string;
}) {
  const { t } = useLang();
  const positioned = vehicles.filter((v) => v.latitude != null && v.longitude != null);
  const points = positioned.map((v) => [v.latitude, v.longitude] as [number, number]);

  return (
    <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <FitToFleet points={points} />
      <FitToSearch points={points} searchKey={searchKey} />
      {route && route.length > 1 && (
        <Polyline positions={route} pathOptions={{ color: "#1F4E79", weight: 4, opacity: 0.75 }} />
      )}
      {positioned.map((v) => {
        const { color } = statusMeta(v.status);
        const faults = Array.isArray(v.fault_codes) ? v.fault_codes.length : 0;
        const d = v.details ?? {};
        const statusLabel = v.status === "moving" ? t("metric.moving") : v.status === "idle" ? t("metric.idle") : v.status;
        return (
          <Marker
            key={v.id}
            position={[v.latitude as number, v.longitude as number]}
            icon={truckIcon(v, v.id === selectedId, hasAlert(v))}
            eventHandlers={{ click: () => onSelect(v) }}
          >
            <Popup>
              <div style={{ font: "13px system-ui", minWidth: 150, maxWidth: 230, color: "#111827" }}>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>{t("detail.truck")} {v.name}</div>
                <div>
                  <span style={{ color, fontWeight: 600 }}>● {statusLabel}</span>
                  {v.speed_mph != null && <span> · {Math.round(v.speed_mph)} mph</span>}
                </div>
                {v.driver_name && <div style={{ color: "#374151", marginTop: 2 }}>{v.driver_name}</div>}
                {(d.make || d.model) && <div style={{ color: "#6b7280" }}>{[d.make, d.model].filter(Boolean).join(" ")}</div>}
                {(v.heading != null || d.location) && (
                  <div style={{ color: "#6b7280", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                    {v.heading != null && <span style={{ display: "inline-block", transform: `rotate(${v.heading}deg)`, fontWeight: 700, color: "#1F4E79" }}>↑</span>}
                    {d.location && <span>{d.location}</span>}
                  </div>
                )}
                {d.hos && (
                  <div style={{ color: "#059669", marginTop: 2 }}>
                    HOS: {d.hos.status ? t(`hos.status.${d.hos.status}`) : "—"}
                    {d.hos.drive_remaining_h != null && ` · ${d.hos.drive_remaining_h}h`}
                  </div>
                )}
                {faults > 0 && (
                  <div style={{ color: "#dc2626", marginTop: 2 }}>{faults} fault code(s)</div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

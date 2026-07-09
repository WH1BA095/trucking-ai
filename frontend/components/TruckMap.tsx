"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Vehicle, statusMeta } from "../lib/api";

// Colored circular badge with a white truck glyph, tinted by status, plus a
// small number label below. Replaces Leaflet's default marker image (which
// doesn't resolve under the Next bundler and renders as a broken "Marker" label).
const TRUCK_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-5l-3-4zM6 18.5A1.5 1.5 0 1 1 7.5 17 1.5 1.5 0 0 1 6 18.5zM19.5 9.5l1.96 2.5H17V9.5zM18 18.5A1.5 1.5 0 1 1 19.5 17 1.5 1.5 0 0 1 18 18.5z"/></svg>`;

function truckIcon(v: Vehicle, selected: boolean) {
  const { color } = statusMeta(v.status);
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="
        background:${color};
        width:30px;height:30px;
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 1px 4px rgba(0,0,0,.4);
        border:2px solid ${selected ? "#111827" : "#fff"};
      ">${TRUCK_SVG}</div>
      <span style="
        margin-top:-4px;
        background:#fff;color:#111827;
        font:600 9px system-ui;
        padding:0 4px;border-radius:4px;
        box-shadow:0 1px 2px rgba(0,0,0,.3);
      ">${v.name}</span>
    </div>`,
    iconSize: [34, 42],
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

export default function TruckMap({
  vehicles,
  selectedId,
  route,
  onSelect,
}: {
  vehicles: Vehicle[];
  selectedId: string | null;
  route?: [number, number][];
  onSelect: (v: Vehicle) => void;
}) {
  const positioned = vehicles.filter((v) => v.latitude != null && v.longitude != null);
  const points = positioned.map((v) => [v.latitude, v.longitude] as [number, number]);

  return (
    <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <FitToFleet points={points} />
      {route && route.length > 1 && (
        <Polyline positions={route} pathOptions={{ color: "#1F4E79", weight: 4, opacity: 0.75 }} />
      )}
      {positioned.map((v) => {
        const { color, label } = statusMeta(v.status);
        const faults = Array.isArray(v.fault_codes) ? v.fault_codes.length : 0;
        return (
          <Marker
            key={v.id}
            position={[v.latitude as number, v.longitude as number]}
            icon={truckIcon(v, v.id === selectedId)}
            eventHandlers={{ click: () => onSelect(v) }}
          >
            <Popup>
              <div style={{ font: "13px system-ui", minWidth: 120 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Truck {v.name}</div>
                <div>
                  <span style={{ color, fontWeight: 600 }}>● {label}</span>
                  {v.speed_mph != null && <span> · {Math.round(v.speed_mph)} mph</span>}
                </div>
                {faults > 0 && (
                  <div style={{ color: "#dc2626", marginTop: 2 }}>⚠ {faults} fault code(s)</div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

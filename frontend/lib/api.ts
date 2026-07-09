const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type FaultCode = {
  spn?: number;
  fmi?: number;
  description?: string;
  fault?: string;
  source?: string;
  count?: number;
};

export type VehicleDetails = {
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  license_plate?: string | null;
  tags?: string[];
  odometer_miles?: number | null;
  engine_hours?: number | null;
  def_percent?: number | null;
  coolant_temp_f?: number | null;
  battery_volts?: number | null;
  ambient_temp_f?: number | null;
  engine_rpm?: number | null;
  engine_load_percent?: number | null;
};

export type Vehicle = {
  id: string;
  name: string;
  driver_name: string | null;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  status: string | null;
  speed_mph: number | null;
  engine_state: string | null;
  fault_codes: FaultCode[] | null;
  details: VehicleDetails | null;
  last_video_url: string | null;
  updated_at: string | null;
};

export type Report = {
  id: string;
  vehicle_id: string;
  vehicle_name: string | null;
  title: string;
  content: string;
  snapshot: any;
  created_at: string | null;
};

// Shared status → color/label map, used by both the map markers and the detail panel.
export const STATUS_META: Record<string, { color: string; label: string }> = {
  moving: { color: "#16a34a", label: "Moving" },
  idle: { color: "#6b7280", label: "Idle" },
  fault: { color: "#dc2626", label: "Fault" },
};

export function statusMeta(status: string | null) {
  return (status && STATUS_META[status]) || { color: "#9ca3af", label: status ?? "Unknown" };
}

export async function fetchVehicles(): Promise<Vehicle[]> {
  const res = await fetch(`${API_URL}/vehicles`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load vehicles");
  return res.json();
}

export async function fetchRoute(vehicleId: string, hours = 8): Promise<[number, number][]> {
  const res = await fetch(`${API_URL}/vehicles/${vehicleId}/route?hours=${hours}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load route");
  const data = await res.json();
  return data.points ?? [];
}

export async function fetchReports(): Promise<Report[]> {
  const res = await fetch(`${API_URL}/reports`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load reports");
  return res.json();
}

export async function generateAllReports(): Promise<{ started: boolean; count: number }> {
  const res = await fetch(`${API_URL}/reports/generate-all`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to start bulk generation");
  return res.json();
}

export async function generateReport(vehicleId: string): Promise<Report> {
  const res = await fetch(`${API_URL}/reports/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicle_id: vehicleId }),
  });
  if (!res.ok) throw new Error("Failed to generate report");
  return res.json();
}

export async function sendChatMessage(userId: string, message: string): Promise<string> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, message }),
  });
  if (!res.ok) throw new Error("Chat request failed");
  const data = await res.json();
  return data.reply;
}

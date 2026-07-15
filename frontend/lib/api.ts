const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// --- auth token plumbing ---
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== "undefined") authToken = localStorage.getItem("token");
  return authToken;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : res.text();
}

// --- types ---
export type FaultCode = {
  spn?: number;
  fmi?: number;
  description?: string;
  fault?: string;
  source?: string;
  count?: number;
  severity?: "high" | "medium" | "low";
  mil?: boolean;
};

export type VehicleDetails = {
  location?: string | null;
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
  alert_level?: string | null;
  drivable?: boolean | null;
  lamps?: string[];
  hos?: {
    status?: string | null;
    drive_remaining_h?: number | null;
    shift_remaining_h?: number | null;
    cycle_remaining_h?: number | null;
    break_in_h?: number | null;
    violation?: boolean;
  } | null;
  fuel?: {
    mpg?: number | null;
    gallons?: number | null;
    miles?: number | null;
    cost_usd?: number | null;
    idle_pct?: number | null;
    period_days?: number | null;
    level_percent?: number | null;      // live tank level, when the truck reports it
    remaining_gallons?: number | null;  // level_percent × tank size
    tank_gallons?: number | null;       // tank capacity used (per-model, LLM-inferred)
  } | null;
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

export type Alert = {
  vehicle_id: string;
  name: string;
  driver_name: string | null;
  latitude: number | null;
  longitude: number | null;
  location: string | null;
  alert_level: "critical" | "warning" | "emissions";
  drivable: boolean;
  max_severity: "high" | "medium" | "low" | null;
  lamps: string[];
  fault_codes: FaultCode[] | null;
  message: string;
};

export const ALERT_META: Record<string, { color: string; bg: string }> = {
  critical: { color: "#dc2626", bg: "#fef2f2" },
  warning: { color: "#d97706", bg: "#fffbeb" },
  emissions: { color: "#2563eb", bg: "#eff6ff" },
};

export type Report = {
  id: string;
  vehicle_id: string;
  vehicle_name: string | null;
  title: string;
  content_en: string;
  content_ru: string;
  snapshot: any;
  created_at: string | null;
};

export type SystemLog = {
  id: string;
  kind: "scheduled_test" | "runtime_error";
  level: "ok" | "warning" | "error";
  component: string | null;
  message: string;
  details: any;
  created_at: string | null;
};

export const LOG_LEVEL_META: Record<string, { color: string; bg: string }> = {
  ok: { color: "#16a34a", bg: "#f0fdf4" },
  warning: { color: "#d97706", bg: "#fffbeb" },
  error: { color: "#dc2626", bg: "#fef2f2" },
};

export type TableInfo = { name: string; rows: number };
export type TableData = {
  table: string;
  columns: string[];
  total: number;
  limit: number;
  offset: number;
  rows: Record<string, any>[];
};

export type User = {
  id: string;
  username: string;
  role: string;
  permissions?: string[] | null;
  avatar?: string | null;
};

export const STATUS_META: Record<string, { color: string; label: string }> = {
  moving: { color: "#16a34a", label: "Moving" },
  idle: { color: "#6b7280", label: "Idle" },
  fault: { color: "#dc2626", label: "Fault" },
};

export function statusMeta(status: string | null) {
  return (status && STATUS_META[status]) || { color: "#9ca3af", label: status ?? "Unknown" };
}

const ACTIVE_ALERT_LEVELS = ["critical", "warning", "emissions"];
// Truck has an active fault lamp (worth the "!" marker) — independent of motion.
export function hasAlert(v: { details?: VehicleDetails | null }): boolean {
  const lvl = v.details?.alert_level;
  return !!lvl && ACTIVE_ALERT_LEVELS.includes(lvl);
}

// --- auth ---
export async function login(username: string, password: string): Promise<{ token: string; user: User }> {
  return apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}
export async function fetchMe(): Promise<User> {
  return apiFetch("/auth/me");
}
export async function updateMe(patch: { username?: string; password?: string; avatar?: string | null }): Promise<User> {
  return apiFetch("/auth/me", { method: "PATCH", body: JSON.stringify(patch) });
}
export async function fetchPermissions(): Promise<string[]> {
  return apiFetch("/auth/permissions");
}
export async function fetchUsers(): Promise<User[]> {
  return apiFetch("/auth/users");
}
export async function createUser(body: { username: string; password: string; role: string; permissions: string[] }): Promise<User> {
  return apiFetch("/auth/users", { method: "POST", body: JSON.stringify(body) });
}
export async function updateUser(id: string, body: any): Promise<User> {
  return apiFetch(`/auth/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
export async function deleteUser(id: string): Promise<any> {
  return apiFetch(`/auth/users/${id}`, { method: "DELETE" });
}

// --- data ---
export async function fetchVehicles(): Promise<Vehicle[]> {
  return apiFetch("/vehicles");
}
export async function fetchRoute(vehicleId: string, hours = 8): Promise<[number, number][]> {
  const data = await apiFetch(`/vehicles/${vehicleId}/route?hours=${hours}`);
  return data.points ?? [];
}
export async function fetchAlerts(): Promise<Alert[]> {
  return apiFetch("/alerts");
}
export async function fetchReports(): Promise<Report[]> {
  return apiFetch("/reports");
}
export async function generateReport(vehicleId: string): Promise<Report> {
  return apiFetch("/reports/generate", { method: "POST", body: JSON.stringify({ vehicle_id: vehicleId }) });
}
export async function generateAllReports(): Promise<{ started: boolean; count: number }> {
  return apiFetch("/reports/generate-all", { method: "POST" });
}
export async function fetchTables(): Promise<TableInfo[]> {
  return apiFetch("/admin/tables");
}
// `filters` is {column: value} — sent as f.<column>=value and matched in SQL
// across the whole table (substring, case-insensitive), not just this page.
export async function fetchTableRows(
  table: string,
  limit = 100,
  offset = 0,
  filters: Record<string, string> = {},
): Promise<TableData> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  for (const [col, val] of Object.entries(filters)) {
    if (val.trim()) params.set(`f.${col}`, val.trim());
  }
  return apiFetch(`/admin/tables/${table}?${params.toString()}`);
}
export async function fetchSystemLogs(kind?: "scheduled_test" | "runtime_error"): Promise<SystemLog[]> {
  return apiFetch(`/system/logs${kind ? `?kind=${kind}` : ""}`);
}
export async function runSelfTest(): Promise<SystemLog[]> {
  return apiFetch("/system/selftest", { method: "POST" });
}
export async function clearSystemLogs(kind?: "scheduled_test" | "runtime_error"): Promise<{ deleted: number }> {
  return apiFetch(`/system/logs${kind ? `?kind=${kind}` : ""}`, { method: "DELETE" });
}

// Unauthenticated liveness ping for the connection indicator. Returns round-trip
// latency in ms, or null if the request failed (no connection).
export async function pingHealth(): Promise<number | null> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return performance.now() - start;
  } catch {
    return null;
  }
}

export async function fetchChatHistory(): Promise<{ role: "user" | "assistant"; text: string }[]> {
  return apiFetch("/chat/history");
}
export async function sendChatMessage(message: string): Promise<string> {
  const data = await apiFetch("/chat", { method: "POST", body: JSON.stringify({ message }) });
  return data.reply;
}

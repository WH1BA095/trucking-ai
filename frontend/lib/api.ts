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
export async function fetchTableRows(table: string, limit = 100, offset = 0): Promise<TableData> {
  return apiFetch(`/admin/tables/${table}?limit=${limit}&offset=${offset}`);
}
export async function fetchChatHistory(): Promise<{ role: "user" | "assistant"; text: string }[]> {
  return apiFetch("/chat/history");
}
export async function sendChatMessage(message: string): Promise<string> {
  const data = await apiFetch("/chat", { method: "POST", body: JSON.stringify({ message }) });
  return data.reply;
}

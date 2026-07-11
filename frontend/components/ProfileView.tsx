"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { useSettings, TIMEZONES } from "../lib/settings";
import {
  User, updateMe, fetchUsers, createUser, updateUser, deleteUser, fetchPermissions,
} from "../lib/api";
import { Icon } from "./icons";
import SystemView from "./SystemView";
import AdminView from "./AdminView";

const ROLES = ["admin", "moderator"];

function Seg({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {options.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          style={{
            padding: "6px 14px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: value === val ? "#1F4E79" : "var(--panel)",
            color: value === val ? "#fff" : "var(--text)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--panel)", color: "var(--text)", fontSize: 14, outline: "none",
};
const btn = (bg: string): React.CSSProperties => ({
  padding: "8px 14px", background: bg, color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
});

function PermChecks({ perms, value, onChange, t }: { perms: string[]; value: string[]; onChange: (v: string[]) => void; t: (k: string) => string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {perms.map((p) => (
        <label key={p} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text)" }}>
          <input
            type="checkbox"
            checked={value.includes(p)}
            onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))}
          />
          {t(`perm.${p}`)}
        </label>
      ))}
    </div>
  );
}

export default function ProfileView({ onClose }: { onClose: () => void }) {
  const { user, setUser, hasPerm } = useAuth();
  const { t, lang, setLang } = useLang();
  const { theme, toggle } = useTheme();
  const { timeZone, setTimeZone, hour12, setHour12 } = useSettings();
  const setTheme = (v: string) => { if (v !== theme) toggle(); };

  // The DB viewer and the system journal (Logs / Tests) live here, tucked away
  // from the main nav. `sub` selects which full-screen tool is open, if any.
  const canViewLogs = hasPerm("view_logs");
  const canViewDb = hasPerm("view_db");
  const [sub, setSub] = useState<null | "logs" | "db">(null);

  // --- my profile ---
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null);
  const [savedProfile, setSavedProfile] = useState(false);

  async function saveProfile() {
    const updated = await updateMe({ username, password: password || undefined, avatar });
    setUser(updated);
    setPassword("");
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 2000);
  }

  function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  }

  // --- user management (admin) ---
  const canManage = hasPerm("manage_users");
  const [allPerms, setAllPerms] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [nu, setNu] = useState({ username: "", password: "", role: "moderator", permissions: [] as string[] });

  useEffect(() => {
    if (!canManage) return;
    fetchPermissions().then(setAllPerms).catch(console.error);
    fetchUsers().then(setUsers).catch(console.error);
  }, [canManage]);

  async function addUser() {
    if (!nu.username || !nu.password) return;
    try {
      await createUser(nu);
      setNu({ username: "", password: "", role: "moderator", permissions: [] });
      setUsers(await fetchUsers());
    } catch (e: any) {
      alert(e.message || "Failed to create user");
    }
  }

  async function saveUser(u: User) {
    await updateUser(u.id, { role: u.role, permissions: u.permissions ?? [] });
    setUsers(await fetchUsers());
  }

  async function removeUser(u: User) {
    if (!confirm(`Delete ${u.username}?`)) return;
    try {
      await deleteUser(u.id);
      setUsers(await fetchUsers());
    } catch (e: any) {
      alert(e.message || "Failed to delete");
    }
  }

  function patchUser(id: string, patch: Partial<User>) {
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  // Full-screen tools (DB viewer / system journal) reached from the cards below.
  const activeSub = (sub === "logs" && canViewLogs) || (sub === "db" && canViewDb) ? sub : null;
  if (activeSub) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <button onClick={() => setSub(null)} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14 }}>
            ← {t("profile.title")}
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>{activeSub === "logs" ? <SystemView /> : <AdminView />}</div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14, marginBottom: 16 }}>
          {t("profile.back")}
        </button>

        <Card title={t("profile.title")}>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--panel2)", border: "1px solid var(--border)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "var(--muted)" }}>
                {avatar ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="user" size={32} />}
              </div>
              <label style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: "#1F4E79", cursor: "pointer" }}>
                {t("profile.upload")}
                <input type="file" accept="image/*" onChange={onAvatarFile} style={{ display: "none" }} />
              </label>
            </div>
            <div style={{ flex: 1, display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--muted)" }}>{t("auth.username")}</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 4, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--muted)" }}>{t("profile.newPassword")}</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 4, boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={saveProfile} style={btn("#1F4E79")}>{t("profile.save")}</button>
                {savedProfile && <span style={{ color: "#16a34a", fontSize: 13 }}>✓ {t("profile.saved")}</span>}
              </div>
            </div>
          </div>
        </Card>

        <Card title={t("settings.title")}>
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 14, color: "var(--text)" }}>{t("settings.language")}</span>
              <Seg value={lang} options={[["en", "EN"], ["ru", "RU"]]} onChange={(v) => setLang(v as any)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 14, color: "var(--text)" }}>{t("settings.hourFormat")}</span>
              <Seg value={hour12 ? "12" : "24"} options={[["24", "24h"], ["12", "12h"]]} onChange={(v) => setHour12(v === "12")} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 14, color: "var(--text)" }}>{t("settings.theme")}</span>
              <Seg value={theme} options={[["light", t("theme.light")], ["dark", t("theme.dark")]]} onChange={setTheme} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 14, color: "var(--text)" }}>{t("settings.timezone")}</span>
              <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)} style={{ ...inputStyle, padding: "6px 10px" }}>
                {TIMEZONES.map((tz) => <option key={tz.id} value={tz.id}>{tz.label}</option>)}
              </select>
            </div>
          </div>
        </Card>

        {canViewDb && (
          <Card title={t("tab.admin")}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("db.menuHint")}</span>
              <button onClick={() => setSub("db")} style={btn("#1F4E79")}>{t("log.menuOpen")}</button>
            </div>
          </Card>
        )}

        {canViewLogs && (
          <Card title="Logs / Tests">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("log.menuHint")}</span>
              <button onClick={() => setSub("logs")} style={btn("#1F4E79")}>{t("log.menuOpen")}</button>
            </div>
          </Card>
        )}

        {canManage && (
          <Card title={t("users.create")}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--muted)", display: "block" }}>{t("auth.username")}</label>
                <input value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} style={{ ...inputStyle, marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--muted)", display: "block" }}>{t("auth.password")}</label>
                <input value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} style={{ ...inputStyle, marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--muted)", display: "block" }}>{t("users.role")}</label>
                <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })} style={{ ...inputStyle, marginTop: 4 }}>
                  {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                </select>
              </div>
              <button onClick={addUser} style={btn("#16a34a")}>{t("users.add")}</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{t("users.permissions")}</div>
            <PermChecks perms={allPerms} value={nu.permissions} onChange={(v) => setNu({ ...nu, permissions: v })} t={t} />
          </Card>
        )}

        {canManage && (
          <Card title={t("users.title")}>
            {users.map((u) => (
              <div key={u.id} style={{ borderTop: "1px solid var(--border)", padding: "14px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>{u.username}</span>
                  <select value={u.role} onChange={(e) => patchUser(u.id, { role: e.target.value })} style={{ ...inputStyle, padding: "4px 8px" }} disabled={u.id === user?.id}>
                    {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                  </select>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => saveUser(u)} style={btn("#1F4E79")}>{t("users.save")}</button>
                  {u.id !== user?.id && <button onClick={() => removeUser(u)} style={btn("#dc2626")}>{t("users.delete")}</button>}
                </div>
                <PermChecks perms={allPerms} value={u.permissions ?? []} onChange={(v) => patchUser(u.id, { permissions: v })} t={t} />
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { AuthUser, UserSettings } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { Input } from "./ui/Input";

interface AccountSettingsProps {
  token: string;
  authUser: AuthUser;
  t: typeof THEMES.dark;
  onClose: () => void;
  onThemeChange?: (theme: "dark" | "light") => void;
}

export function AccountSettings({ token, authUser, t, onClose, onThemeChange }: AccountSettingsProps) {
  const [settings, setSettings] = useState<UserSettings>({ user_id: authUser.id, display_name: null, email: null, bio: null, theme: "dark" });
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [tab, setTab] = useState<"profile" | "security">("profile");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API}/account/settings`, { headers: hdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSettings(d); });
  }, []);

  async function saveProfile() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`${API}/account/settings`, {
        method: "PATCH", headers: hdr,
        body: JSON.stringify({ display_name: settings.display_name, email: settings.email, bio: settings.bio, theme: settings.theme }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ type: "ok", text: "Збережено!" });
      if (onThemeChange && (settings.theme === "dark" || settings.theme === "light")) {
        onThemeChange(settings.theme as "dark" | "light");
      }
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setSaving(false); }
  }

  async function changePassword() {
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwMsg({ type: "err", text: "Паролі не збігаються" }); return;
    }
    setSaving(true); setPwMsg(null);
    try {
      const res = await fetch(`${API}/account/password`, {
        method: "PATCH", headers: hdr,
        body: JSON.stringify({ current_password: pwForm.current_password, new_password: pwForm.new_password }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setPwMsg({ type: "ok", text: "Пароль змінено!" });
      setPwForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (e: any) { setPwMsg({ type: "err", text: e.message }); }
    finally { setSaving(false); }
  }

  const tabBtn = (id: typeof tab, label: string) => (
    <button onClick={() => setTab(id)} style={{
      background: tab === id ? t.bg4 : "transparent",
      border: `1px solid ${tab === id ? t.border2 : "transparent"}`,
      borderRadius: 4, padding: "6px 16px", fontSize: 12,
      color: tab === id ? t.text : t.textDim, cursor: "pointer", fontFamily: "inherit",
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: t.bg, fontFamily: "'Roboto Mono',monospace" }}>
      <div style={{ background: t.bg2, border: `1px solid ${t.border2}`, borderRadius: 8, padding: "28px 32px", width: "min(520px, 94vw)", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, color: t.text, fontWeight: 600 }}>Налаштування акаунта</div>
            <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>@{authUser.username} · {authUser.role}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: t.textDim, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8 }}>
          {tabBtn("profile", "Профіль")}
          {tabBtn("security", "Безпека")}
        </div>

        {tab === "profile" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>Відображуване ім'я</label>
              <Input t={t} placeholder="Ваше ім'я" value={settings.display_name || ""} onChange={v => setSettings(s => ({ ...s, display_name: v }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>Email</label>
              <Input t={t} type="email" placeholder="email@example.com" value={settings.email || ""} onChange={v => setSettings(s => ({ ...s, email: v }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>Про себе</label>
              <textarea value={settings.bio || ""} onChange={v => setSettings(s => ({ ...s, bio: v }))}
                placeholder="Короткий опис..." rows={3}
                style={{ width: "100%", background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "8px 10px", fontSize: 12, color: t.text, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>Тема</label>
              <select value={settings.theme} onChange={v => setSettings(s => ({ ...s, theme: v }))}
                style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "7px 10px", fontSize: 12, color: t.text, fontFamily: "inherit", width: "100%" }}>
                <option value="dark">Темна</option>
                <option value="light">Світла</option>
              </select>
            </div>
            {msg && <div style={{ fontSize: 12, color: msg.type === "ok" ? t.green : t.red }}>{msg.text}</div>}
            <button onClick={saveProfile} disabled={saving}
              style={{ background: t.red, border: "none", borderRadius: 4, padding: "9px 0", fontSize: 12, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              {saving ? "Збереження..." : "Зберегти зміни"}
            </button>
          </div>
        )}

        {tab === "security" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, color: t.textDim }}>Зміна пароля</div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>Поточний пароль</label>
              <Input t={t} type="password" placeholder="••••••••" value={pwForm.current_password} onChange={v => setPwForm(f => ({ ...f, current_password: v }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>Новий пароль</label>
              <Input t={t} type="password" placeholder="мінімум 6 символів" value={pwForm.new_password} onChange={v => setPwForm(f => ({ ...f, new_password: v }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>Підтвердити новий пароль</label>
              <Input t={t} type="password" placeholder="••••••••" value={pwForm.confirm_password} onChange={v => setPwForm(f => ({ ...f, confirm_password: v }))} />
            </div>
            {pwMsg && <div style={{ fontSize: 12, color: pwMsg.type === "ok" ? t.green : t.red }}>{pwMsg.text}</div>}
            <button onClick={changePassword} disabled={saving}
              style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "9px 0", fontSize: 12, color: t.text, cursor: "pointer", fontFamily: "inherit" }}>
              {saving ? "Збереження..." : "Змінити пароль"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { AuthUser, UserSettings, Theme } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { Input } from "./ui/Input";
import { I18N, Language } from "@/i18n";

interface AccountSettingsProps {
  token: string;
  authUser: AuthUser;
  t: typeof THEMES.dark;
  onClose: () => void;
  onThemeChange?: (theme: Theme) => void;
  onLanguageChange?: (language: Language) => void;
}

export function AccountSettings({ token, authUser, t, onClose, onThemeChange, onLanguageChange }: AccountSettingsProps) {
  const [settings, setSettings] = useState<UserSettings & { language?: string }>({
    user_id: authUser.id, display_name: null, email: null, bio: null, theme: "dark", language: "uk",
  });
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [tab, setTab] = useState<"profile" | "security">("profile");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const l = I18N[(settings.language === "en" ? "en" : "uk") as Language];

  useEffect(() => {
    fetch(`${API}/account/settings`, { headers: hdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setSettings(d);
          // Apply loaded theme and language immediately
          if (d.theme && onThemeChange) onThemeChange(d.theme as Theme);
          if (d.language && onLanguageChange) onLanguageChange(d.language as Language);
        }
      });
  }, []);

  async function saveProfile() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`${API}/account/settings`, {
        method: "PATCH", headers: hdr,
        body: JSON.stringify({
          display_name: settings.display_name,
          email: settings.email,
          bio: settings.bio,
          theme: settings.theme,
          language: settings.language || "uk",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ type: "ok", text: l.saved });
      if (onThemeChange) onThemeChange(settings.theme as Theme);
      if (onLanguageChange) onLanguageChange((settings.language || "uk") as Language);
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setSaving(false); }
  }

  async function changePassword() {
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwMsg({ type: "err", text: l.passwordMismatch }); return;
    }
    setSaving(true); setPwMsg(null);
    try {
      const res = await fetch(`${API}/account/password`, {
        method: "PATCH", headers: hdr,
        body: JSON.stringify({ current_password: pwForm.current_password, new_password: pwForm.new_password }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setPwMsg({ type: "ok", text: l.passwordChanged });
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
            <div style={{ fontSize: 15, color: t.text, fontWeight: 600 }}>{l.accountSettings}</div>
            <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>@{authUser.username} · {authUser.role}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: t.textDim, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8 }}>
          {tabBtn("profile", l.profileTab)}
          {tabBtn("security", l.securityTab)}
        </div>

        {tab === "profile" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>{l.displayName}</label>
              <Input t={t} placeholder={l.displayName} value={settings.display_name || ""} onChange={(v: string) => setSettings(s => ({ ...s, display_name: v }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>Email</label>
              <Input t={t} type="email" placeholder="email@example.com" value={settings.email || ""} onChange={(v: string) => setSettings(s => ({ ...s, email: v }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>{l.bio}</label>
              <textarea value={settings.bio || ""} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSettings(s => ({ ...s, bio: e.target.value }))}
                placeholder="..." rows={3}
                style={{ width: "100%", background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "8px 10px", fontSize: 12, color: t.text, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
            </div>

            {/* Language */}
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 8 }}>{l.language}</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["uk", "en"] as Language[]).map(lang => (
                  <button
                    key={lang}
                    onClick={() => setSettings(s => ({ ...s, language: lang }))}
                    style={{
                      padding: "7px 20px",
                      borderRadius: 6,
                      border: `1.5px solid ${settings.language === lang ? t.accent : t.border2}`,
                      background: settings.language === lang ? t.accentBg || t.bg4 : "transparent",
                      color: settings.language === lang ? t.accent : t.textDim,
                      fontSize: 13,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      fontWeight: settings.language === lang ? 600 : 400,
                      transition: "all 0.12s",
                    }}
                  >
                    {lang === "uk" ? "UA" : "EN"}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 8 }}>{l.theme}</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                {([
                  { key: "dark",          grad: "linear-gradient(135deg, #0a0a0a 0%, #1e1e1e 50%, #5a8ae0 100%)",                       light: false },
                  { key: "light",         grad: "linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 50%, #2563eb 100%)",                       light: true  },
                  { key: "void",          grad: "linear-gradient(135deg, #0d0010 0%, #1e0028 50%, #6800FF 100%)",                       light: false },
                  { key: "void-light",    grad: "linear-gradient(135deg, #fdf8ff 0%, #ebe0ff 55%, #6800FF 100%)",                       light: true  },
                  { key: "lakers",        grad: "linear-gradient(135deg, #0e0916 0%, #201430 40%, #552583 70%, #FDB927 100%)",           light: false },
                  { key: "lakers-light",  grad: "linear-gradient(135deg, #fdf8ff 0%, #ede3ff 45%, #552583 78%, #FDB927 100%)",          light: true  },
                  { key: "electric",      grad: "linear-gradient(135deg, #00010f 0%, #00042a 50%, #0038FF 80%, #FFE500 100%)",           light: false },
                  { key: "electric-light",grad: "linear-gradient(135deg, #f5f8ff 0%, #dce8ff 50%, #0038FF 80%, #FFE500 100%)",          light: true  },
                  { key: "forest",        grad: "linear-gradient(135deg, #060f09 0%, #13241b 50%, #1A3A2A 70%, #FF4500 100%)",          light: false },
                  { key: "forest-light",  grad: "linear-gradient(135deg, #f4faf6 0%, #d8eedd 50%, #1A5C38 75%, #FF4500 100%)",         light: true  },
                  { key: "neon",          grad: "linear-gradient(135deg, #0a0008 0%, #1c0020 50%, #FF007F 80%, #BAFF29 100%)",          light: false },
                  { key: "neon-light",    grad: "linear-gradient(135deg, #fff5fa 0%, #ffd8ec 50%, #FF007F 78%, #BAFF29 100%)",         light: true  },
                ] as { key: string; grad: string; light: boolean }[]).map(({ key, grad, light }) => {
                  const isSelected = settings.theme === key;
                  return (
                    <button key={key} onClick={() => setSettings(s => ({ ...s, theme: key }))} style={{
                      position: "relative", background: grad,
                      border: isSelected
                        ? `2px solid ${light ? "#1a1a1a" : "#ffffff"}`
                        : `2px solid ${light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 8, aspectRatio: "1", cursor: "pointer", padding: 0, overflow: "hidden",
                      outline: "none",
                      transition: "transform 0.12s, border-color 0.12s",
                      transform: isSelected ? "scale(1.08)" : "scale(1)",
                    }}>
                      {isSelected && (
                        <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 13, color: light ? "#1a1a1a" : "#ffffff", lineHeight: 1, textShadow: light ? "none" : "0 1px 4px rgba(0,0,0,0.8)" }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {msg && <div style={{ fontSize: 12, color: msg.type === "ok" ? t.green : t.red }}>{msg.text}</div>}
            <button onClick={saveProfile} disabled={saving}
              style={{ background: t.red, border: "none", borderRadius: 4, padding: "9px 0", fontSize: 12, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              {saving ? "..." : l.save}
            </button>
          </div>
        )}

        {tab === "security" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, color: t.textDim }}>{l.changePassword}</div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>{l.currentPassword}</label>
              <Input t={t} type="password" placeholder="••••••••" value={pwForm.current_password} onChange={(v: string) => setPwForm(f => ({ ...f, current_password: v }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>{l.newPassword}</label>
              <Input t={t} type="password" placeholder="min 6" value={pwForm.new_password} onChange={(v: string) => setPwForm(f => ({ ...f, new_password: v }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: t.textDim, display: "block", marginBottom: 4 }}>{l.confirmPassword}</label>
              <Input t={t} type="password" placeholder="••••••••" value={pwForm.confirm_password} onChange={(v: string) => setPwForm(f => ({ ...f, confirm_password: v }))} />
            </div>
            {pwMsg && <div style={{ fontSize: 12, color: pwMsg.type === "ok" ? t.green : t.red }}>{pwMsg.text}</div>}
            <button onClick={changePassword} disabled={saving}
              style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "9px 0", fontSize: 12, color: t.text, cursor: "pointer", fontFamily: "inherit" }}>
              {saving ? "..." : l.changePassword}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

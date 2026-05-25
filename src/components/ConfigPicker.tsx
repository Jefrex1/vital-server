"use client";

import React, { useState, useEffect } from "react";
import { SSHConfig, AuthUser, GroupInvite } from "@/types";
import { API, THEMES } from "@/constants/themes";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { IconUsers, IconSettings, IconShield2, IconKey, IconFolder, IconX } from "./ui/Icons";

interface ConfigPickerProps {
  token: string;
  authUser: AuthUser;
  onConnect: (cfg: SSHConfig) => void;
  t: typeof THEMES.dark;
  onGroupsClick: () => void;
  onAccountClick: () => void;
  onAdminClick?: () => void;
  onLogout: () => void;
}

export function ConfigPicker({
  token,
  authUser,
  onConnect,
  t,
  onGroupsClick,
  onAccountClick,
  onAdminClick,
  onLogout,
}: ConfigPickerProps) {
  const [configs, setConfigs] = useState<SSHConfig[]>([]);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    label: "",
    host: "",
    port: "22",
    username: "",
    password: "",
    auth_type: "password" as "password" | "key",
    ssh_key: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hdr = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  async function load() {
    const [cRes, iRes] = await Promise.all([
      fetch(`${API}/configs`, { headers: hdr }),
      fetch(`${API}/invites`, { headers: hdr }),
    ]);
    if (cRes.ok) setConfigs(await cRes.json());
    if (iRes.ok) { const inv = await iRes.json(); setPendingInvites(inv.length); }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveConfig() {
    setLoading(true);
    setError("");
    try {
      const body: any = { ...form, port: Number(form.port) };
      if (form.auth_type === "password") delete body.ssh_key;
      else delete body.password;

      const res = await fetch(`${API}/configs`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowAdd(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteConfig(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this config?")) return;
    await fetch(`${API}/configs/${id}`, {
      method: "DELETE",
      headers: hdr,
    });
    load();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: t.bg,
        fontFamily: "'Roboto Mono',monospace",
      }}
    >
      <div
        style={{
          background: t.bg2,
          border: `1px solid ${t.border2}`,
          borderRadius: 8,
          padding: "28px 32px",
          width: "min(520px, 94vw)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.red} strokeWidth="2.5">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span style={{ fontSize: 14, color: t.text }}>oServer</span>
            <span style={{ fontSize: 11, color: t.textDim }}>— підключення</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setShowAdd((s) => !s)}
              style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "5px 12px", fontSize: 12, color: t.textMid, cursor: "pointer", fontFamily: "inherit" }}>
              + Додати
            </button>
          </div>
        </div>

        {/* Navigation row */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={onGroupsClick}
            style={{ background: "transparent", border: `1px solid ${t.border2}`, borderRadius: 4, padding: "5px 12px", fontSize: 11, color: t.textDim, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
            <IconUsers size={12} color="currentColor" /> Групи
            {pendingInvites > 0 && <span style={{ background: t.red, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>{pendingInvites}</span>}
          </button>
          <button onClick={onAccountClick}
            style={{ background: "transparent", border: `1px solid ${t.border2}`, borderRadius: 4, padding: "5px 12px", fontSize: 11, color: t.textDim, cursor: "pointer", fontFamily: "inherit" }}>
            <IconSettings size={12} color="currentColor" /> Акаунт
          </button>
          {onAdminClick && (
            <button onClick={onAdminClick}
              style={{ background: "transparent", border: `1px solid ${t.border2}`, borderRadius: 4, padding: "5px 12px", fontSize: 11, color: t.textDim, cursor: "pointer", fontFamily: "inherit" }}>
              <IconShield2 size={12} color="currentColor" /> Адмін
            </button>
          )}
          <button onClick={onLogout}
            style={{ background: "transparent", border: `1px solid ${t.border2}`, borderRadius: 4, padding: "5px 12px", fontSize: 11, color: t.red, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>
            Вийти
          </button>
        </div>

        {/* User info */}
        <div style={{ background: t.bg4, border: `1px solid ${t.border}`, borderRadius: 4, padding: "8px 12px", fontSize: 11, color: t.textDim }}>
          Увійшли як <span style={{ color: t.text }}>@{authUser.username}</span>
          {authUser.role === "admin" && <span style={{ color: t.red, marginLeft: 8 }}>[admin]</span>}
        </div>

        {showAdd && (
          <div
            style={{
              background: t.bg3,
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <Input
                label="Label"
                value={form.label}
                onChange={(v) =>
                  setForm((f) => ({ ...f, label: v }))
                }
                t={t}
              />
              <Input
                label="Host"
                value={form.host}
                onChange={(v) =>
                  setForm((f) => ({ ...f, host: v }))
                }
                t={t}
              />
              <Input
                label="Username"
                value={form.username}
                onChange={(v) =>
                  setForm((f) => ({ ...f, username: v }))
                }
                t={t}
              />
              <Input
                label="Port"
                value={form.port}
                onChange={(v) =>
                  setForm((f) => ({ ...f, port: v }))
                }
                type="number"
                t={t}
              />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              <label
                style={{
                  fontSize: 10,
                  color: t.textDim,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Auth type
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["password", "key"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() =>
                      setForm((f) => ({ ...f, auth_type: a }))
                    }
                    style={{
                      flex: 1,
                      background:
                        form.auth_type === a ? t.accentBg : t.bg4,
                      border: `1px solid ${
                        form.auth_type === a
                          ? t.accentBorder
                          : t.border2
                      }`,
                      borderRadius: 4,
                      padding: "7px",
                      fontSize: 12,
                      color:
                        form.auth_type === a
                          ? t.accent
                          : t.textMid,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {a === "password" ? <><IconKey size={11} color="currentColor" /> Password</> : <><IconKey size={11} color="currentColor" /> SSH Key</>}
                  </button>
                ))}
              </div>
            </div>

            {form.auth_type === "password" ? (
              <Input
                label="Password"
                value={form.password}
                onChange={(v) =>
                  setForm((f) => ({ ...f, password: v }))
                }
                type="password"
                t={t}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                <label
                  style={{
                    fontSize: 10,
                    color: t.textDim,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Private key (PEM)
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <textarea
                    value={form.ssh_key}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        ssh_key: e.target.value,
                      }))
                    }
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                    style={{
                      flex: 1,
                      background: t.inputBg,
                      border: `1px solid ${t.border2}`,
                      borderRadius: 4,
                      padding: "8px 12px",
                      color: t.text,
                      fontFamily: "inherit",
                      fontSize: 12,
                      outline: "none",
                      resize: "vertical",
                      minHeight: 80,
                    }}
                  />
                  <button
                    onClick={() => {
                      const i = document.createElement("input");
                      i.type = "file";
                      i.onchange = () => {
                        if (!i.files?.[0]) return;
                        const r = new FileReader();
                        r.onload = () =>
                          setForm((f) => ({
                            ...f,
                            ssh_key: r.result as string,
                          }));
                        r.readAsText(i.files[0]);
                      };
                      i.click();
                    }}
                    style={{
                      background: t.bg4,
                      border: `1px solid ${t.border2}`,
                      borderRadius: 4,
                      padding: "8px 10px",
                      fontSize: 11,
                      color: t.textMid,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                      alignSelf: "flex-start",
                    }}
                  >
                    Browse
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div style={{ fontSize: 12, color: t.red }}>
                {error}
              </div>
            )}

            <button
              onClick={saveConfig}
              disabled={loading}
              style={{
                background: t.accentBg,
                border: `1px solid ${t.accentBorder}`,
                borderRadius: 4,
                padding: "8px",
                fontSize: 12,
                color: t.accent,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {loading ? "Saving…" : "Save config"}
            </button>
          </div>
        )}

        {(() => {
          const groupCfgs = configs.filter(c => c.group_id);
          const personalCfgs = configs.filter(c => !c.group_id);

          const renderCard = (cfg: SSHConfig, isGroup = false) => (
            <div
              key={cfg.id}
              onClick={() => onConnect(cfg)}
              style={{
                background: t.bg3,
                border: `1px solid ${isGroup ? t.accent + "55" : t.border}`,
                borderRadius: 6,
                padding: "12px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition: "border-color 0.1s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = t.accent)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = isGroup ? t.accent + "55" : t.border)
              }
            >
              <div>
                <div style={{ fontSize: 13, color: t.text, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                  {isGroup && <span style={{ fontSize: 11, background: t.accent + "22", color: t.accent, borderRadius: 3, padding: "1px 6px" }}>група</span>}
                  {(cfg.label || cfg.host).replace(/^\[Group\]\s*/i, "")}
                </div>
                <div style={{ fontSize: 11, color: t.textDim }}>
                  {cfg.username}@{cfg.host}:{cfg.port} ·{" "}
                  {cfg.auth_type === "key" ? <><IconKey size={11} color="currentColor" /> key</> : <><IconKey size={11} color="currentColor" /> pw</>}
                  {cfg.provision_root_path && (
                    <span style={{ marginLeft: 6, opacity: 0.7, display: "inline-flex", alignItems: "center", gap: 3 }}><IconFolder size={11} color="currentColor" /> {cfg.provision_root_path}</span>
                  )}
                </div>
              </div>
              {!isGroup && (
                <button
                  onClick={(e) => deleteConfig(cfg.id!, e)}
                  style={{
                    background: "none",
                    border: "none",
                    color: t.textDim,
                    cursor: "pointer",
                    fontSize: 15,
                    padding: "4px 6px",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = t.red)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = t.textDim)}
                >
                  <IconX size={14} color="currentColor" />
                </button>
              )}
            </div>
          );

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {groupCfgs.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, color: t.textDim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Групові сервери
                  </div>
                  {groupCfgs.map(cfg => renderCard(cfg, true))}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {groupCfgs.length > 0 && (
                  <div style={{ fontSize: 11, color: t.textDim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Мої сервери
                  </div>
                )}
                {personalCfgs.length === 0 && groupCfgs.length === 0 && (
                  <div style={{ fontSize: 12, color: t.textDim, padding: "10px 0" }}>
                    No saved configs yet. Add one above.
                  </div>
                )}
                {personalCfgs.map(cfg => renderCard(cfg, false))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { AccessRole, AuthUser, GroupRow, GroupInvite, SSHConfig } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { IconCrown, IconShield, IconUser, IconChevronUp, IconChevronDown, IconX, IconSettings, IconArrowLeft } from "./ui/Icons";
import { I18N, Language } from "@/i18n";

interface GroupsPanelProps {
  token: string;
  authUser: AuthUser;
  t: typeof THEMES.dark;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onClose: () => void;
}

export function GroupsPanel({ token, authUser, t, language, onLanguageChange, onClose }: GroupsPanelProps) {
  const l = I18N[language];
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [myConfigs, setMyConfigs] = useState<SSHConfig[]>([]);
  const [tab, setTab] = useState<"my" | "invites">("my");
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newGroup, setNewGroup] = useState({ name: "", description: "", provision_config_id: "", provision_root_path: "" });
  const [inviteModal, setInviteModal] = useState<{ groupId: number; groupName: string } | null>(null);
  const [inviteTarget, setInviteTarget] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [addServerModal, setAddServerModal] = useState<{ groupId: number; groupName: string } | null>(null);
  const [serverAccessRole, setServerAccessRole] = useState<AccessRole>("operator");
  const [provisionModal, setProvisionModal] = useState<{ groupId: number; groupName: string; provision_config_id: string; provision_root_path: string } | null>(null);
  const [provisionLoading, setProvisionLoading] = useState(false);
  const [provisionMsg, setProvisionMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [sudoPassword, setSudoPassword] = useState("");

  const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function load() {
    const [gRes, iRes, cRes] = await Promise.all([
      fetch(`${API}/groups`, { headers: hdr }),
      fetch(`${API}/invites`, { headers: hdr }),
      fetch(`${API}/configs`, { headers: hdr }),
    ]);
    if (gRes.ok) setGroups(await gRes.json());
    if (iRes.ok) setInvites(await iRes.json());
    if (cRes.ok) setMyConfigs(await cRes.json());
  }

  useEffect(() => { load(); }, []);

  const myGroups = groups.filter(g => g.members.some(m => m.id === authUser.id));

  function myRoleInGroup(g: GroupRow): string | null {
    const me = g.members.find(m => m.id === authUser.id);
    return me ? me.group_role : null;
  }

  function canManage(g: GroupRow): boolean {
    const role = myRoleInGroup(g);
    return role === "owner" || role === "moderator";
  }

  async function createGroup() {
    if (!newGroup.name) { setCreateError(l.nameRequired); return; }
    setCreateError("");
    const body: any = { name: newGroup.name, description: newGroup.description };
    if (newGroup.provision_config_id) body.provision_config_id = Number(newGroup.provision_config_id);
    if (newGroup.provision_root_path) body.provision_root_path = newGroup.provision_root_path;
    const res = await fetch(`${API}/groups`, { method: "POST", headers: hdr, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) {
      setShowCreate(false);
      setNewGroup({ name: "", description: "", provision_config_id: "", provision_root_path: "" });
      setCreateError("");
      load();
    }
    else setCreateError(data.error || "Помилка створення");
  }

  async function runProvision() {
    if (!provisionModal) return;
    setProvisionLoading(true);
    setProvisionMsg(null);
    const res = await fetch(`${API}/groups/${provisionModal.groupId}/provision`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify({
        provision_config_id: provisionModal.provision_config_id ? Number(provisionModal.provision_config_id) : undefined,
        provision_root_path: provisionModal.provision_root_path || undefined,
        sudo_password: sudoPassword || undefined,
      }),
    });
    const data = await res.json();
    setProvisionLoading(false);
    setSudoPassword("");
    if (res.ok) {
      setProvisionMsg({ text: `✓ Готово! Linux user: ${data.linux_user}, шлях: ${data.root_path}`, ok: true });
      load();
    } else {
      setProvisionMsg({ text: "✕ " + data.error, ok: false });
    }
  }

  async function sendInvite() {
    if (!inviteModal || !inviteTarget) return;
    setInviteMsg("");
    const isId = /^\d+$/.test(inviteTarget);
    const body = isId ? { user_id: Number(inviteTarget) } : { username: inviteTarget };
    const res = await fetch(`${API}/groups/${inviteModal.groupId}/invite`, { method: "POST", headers: hdr, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) { setInviteMsg("✓ Запит надіслано!"); setInviteTarget(""); setTimeout(() => { setInviteModal(null); setInviteMsg(""); }, 1500); }
    else setInviteMsg("✕ " + data.error);
  }

  async function respondInvite(id: number, action: "accept" | "decline") {
    await fetch(`${API}/invites/${id}`, { method: "PATCH", headers: hdr, body: JSON.stringify({ action }) });
    load();
  }

  async function addServerToGroup(groupId: number, configId: number, access_role: AccessRole) {
    await fetch(`${API}/groups/${groupId}/configs`, { method: "POST", headers: hdr, body: JSON.stringify({ config_id: configId, access_role }) });
    load();
  }

  async function removeServerFromGroup(groupId: number, configId: number) {
    await fetch(`${API}/groups/${groupId}/configs/${configId}`, { method: "DELETE", headers: hdr });
    load();
  }

  async function leaveGroup(groupId: number) {
    if (!confirm("Покинути групу?")) return;
    await fetch(`${API}/groups/${groupId}/members/${authUser.id}`, { method: "DELETE", headers: hdr });
    load();
  }

  async function deleteGroup(groupId: number, groupName: string) {
    if (!confirm(`Видалити групу "${groupName}"? Цю дію неможливо відмінити.`)) return;
    await fetch(`${API}/groups/${groupId}`, { method: "DELETE", headers: hdr });
    load();
  }

  async function changeMemberRole(groupId: number, userId: number, newRole: string) {
    await fetch(`${API}/groups/${groupId}/members/${userId}/role`, { method: "PATCH", headers: hdr, body: JSON.stringify({ group_role: newRole }) });
    load();
  }

  async function removeMember(groupId: number, userId: number) {
    if (!confirm("Видалити учасника з групи?")) return;
    await fetch(`${API}/groups/${groupId}/members/${userId}`, { method: "DELETE", headers: hdr });
    load();
  }

  const ROLE_LABELS: Record<string, React.ReactNode> = {
    owner: <><IconCrown size={10} color="currentColor" /> власник</>,
    moderator: <><IconShield size={10} color="currentColor" /> модератор</>,
    member: <><IconUser size={10} color="currentColor" /> учасник</>,
  };
  const ROLE_COLOR: Record<string, string> = { owner: t.red || "#e53935", moderator: "#7c4dff", member: t.textDim };
  const ACCESS_LABELS: Record<AccessRole, string> = {
    admin: l.roleAdmin,
    operator: l.roleOperator,
    observer: l.roleObserver,
  };

  const tabBtn = (id: typeof tab, label: string, badge?: number) => (
    <button onClick={() => setTab(id)} style={{
      background: tab === id ? t.bg4 : "transparent",
      border: `1px solid ${tab === id ? t.border2 : "transparent"}`,
      borderRadius: 4, padding: "6px 14px", fontSize: 12,
      color: tab === id ? t.text : t.textDim, cursor: "pointer", fontFamily: "inherit",
      display: "flex", alignItems: "center", gap: 6,
    }}>
      {label}
      {badge ? <span style={{ background: t.red, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>{badge}</span> : null}
    </button>
  );

  const card = (content: React.ReactNode) => (
    <div style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 6, padding: "12px 14px" }}>
      {content}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: "'Roboto Mono',monospace", display: "flex", flexDirection: "column" }}>
      {/* Topbar */}
      <div style={{ background: t.bg2, borderBottom: `1px solid ${t.border}`, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.red} strokeWidth="2.5"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          <span style={{ fontSize: 14, color: t.text }}>oServer</span>
          <span style={{ fontSize: 11, color: t.textDim }}>- {l.titleSuffixGroups}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as Language)}
            title={l.language}
            style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "5px 8px", fontSize: 11, color: t.textDim, cursor: "pointer", fontFamily: "inherit" }}
          >
            <option value="uk">UA</option>
            <option value="en">EN</option>
          </select>
          <button onClick={() => setShowCreate(true)} style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: "5px 12px", fontSize: 11, color: t.accent, cursor: "pointer", fontFamily: "inherit" }}>
            + {l.createGroup}
          </button>
          <button onClick={onClose} style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "5px 12px", fontSize: 11, color: t.textDim, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
            <IconArrowLeft size={11} color="currentColor" /> {l.back}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: "20px", maxWidth: 720, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {tabBtn("my", l.myGroups)}
          {tabBtn("invites", l.invites, invites.length || undefined)}
        </div>

        {tab === "my" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {myGroups.length === 0 && (
              <div style={{ textAlign: "center", color: t.textDim, fontSize: 13, padding: "40px 0" }}>
                {l.noGroups}<br/>
                <span style={{ fontSize: 11 }}>{language === "uk" ? "Створіть групу або прийміть запрошення." : "Create a group or accept an invite."}</span>
              </div>
            )}
            {myGroups.map(g => {
              const expanded = expandedGroup === g.id;
              const isManager = canManage(g);
              const isOwner = myRoleInGroup(g) === "owner";
              const myRole = myRoleInGroup(g) || "member";
              return (
                <div key={g.id} style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                    onClick={() => setExpandedGroup(expanded ? null : g.id)}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{g.name}</span>
                        <span style={{ fontSize: 10, color: ROLE_COLOR[myRole], background: t.bg2, borderRadius: 3, padding: "1px 6px", border: `1px solid ${t.border}` }}>
                          {ROLE_LABELS[myRole] || myRole}
                        </span>
                      </div>
                      {g.description && <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{g.description}</div>}
                      <div style={{ fontSize: 10, color: t.textDim, marginTop: 4 }}>
                        {g.members.length} учасн. · {(g.configs || []).length} серв.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {isOwner && (
                        <button onClick={e => { e.stopPropagation(); const provisioned = (g as any).provisioned_at; setProvisionModal({ groupId: g.id, groupName: g.name, provision_config_id: String((g as any).provision_config_id || ""), provision_root_path: (g as any).provision_root_path || "" }); setProvisionMsg(null); }}
                          style={{ background: (g as any).provisioned_at ? "transparent" : "transparent", border: `1px solid ${(g as any).provisioned_at ? t.border2 : t.border2}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: (g as any).provisioned_at ? (t.green || "#4caf50") : t.textDim, cursor: "pointer", fontFamily: "inherit" }}>
                          {(g as any).provisioned_at ? <><IconSettings size={11} color="currentColor" /> Provisioned</> : <><IconSettings size={11} color="currentColor" /> Provision</>}
                        </button>
                      )}
                      {isManager && (
                        <button onClick={e => { e.stopPropagation(); setInviteModal({ groupId: g.id, groupName: g.name }); }}
                          style={{ background: "transparent", border: `1px solid ${t.border2}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: t.textDim, cursor: "pointer", fontFamily: "inherit" }}>
                          + Запросити
                        </button>
                      )}
                      {isManager && (
                        <button onClick={e => { e.stopPropagation(); setServerAccessRole("operator"); setAddServerModal({ groupId: g.id, groupName: g.name }); }}
                          style={{ background: "transparent", border: `1px solid ${t.border2}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: t.textDim, cursor: "pointer", fontFamily: "inherit" }}>
                          + {language === "uk" ? "Сервер" : "Server"}
                        </button>
                      )}
                      {!isOwner && (
                        <button onClick={e => { e.stopPropagation(); leaveGroup(g.id); }}
                          style={{ background: "transparent", border: `1px solid ${t.border2}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: t.textDim, cursor: "pointer", fontFamily: "inherit" }}>
                          Покинути
                        </button>
                      )}
                      {isOwner && (
                        <button onClick={e => { e.stopPropagation(); deleteGroup(g.id, g.name); }}
                          style={{ background: "transparent", border: `1px solid ${t.red}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: t.red, cursor: "pointer", fontFamily: "inherit" }}>
                          Видалити
                        </button>
                      )}
                      <span style={{ color: t.textDim, fontSize: 12 }}>{expanded ? <IconChevronUp size={12} color="currentColor" /> : <IconChevronDown size={12} color="currentColor" />}</span>
                    </div>
                  </div>

                  {expanded && (
                    <div style={{ borderTop: `1px solid ${t.border}`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* Members */}
                      <div>
                        <div style={{ fontSize: 11, color: t.textDim, marginBottom: 6 }}>УЧАСНИКИ</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {g.members.map(m => (
                            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: t.bg2, borderRadius: 4, padding: "5px 10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, color: m.id === authUser.id ? t.green : t.text }}>@{m.username}</span>
                                <span style={{ fontSize: 10, color: ROLE_COLOR[m.group_role || "member"] }}>
                                  {ROLE_LABELS[m.group_role || "member"] || m.group_role}
                                </span>
                              </div>
                              {isOwner && m.id !== authUser.id && (
                                <div style={{ display: "flex", gap: 4 }}>
                                  <select
                                    value={m.group_role || "member"}
                                    onChange={e => changeMemberRole(g.id, m.id, e.target.value)}
                                    style={{ background: t.bg4, border: `1px solid ${t.border}`, borderRadius: 3, color: t.textDim, fontSize: 10, padding: "2px 4px", fontFamily: "inherit", cursor: "pointer" }}>
                                    <option value="owner">власник</option>
                                    <option value="moderator">модератор</option>
                                    <option value="member">учасник</option>
                                  </select>
                                  <button onClick={() => removeMember(g.id, m.id)}
                                    style={{ background: "transparent", border: "none", color: t.red, cursor: "pointer", padding: "0 4px", display: "flex", alignItems: "center" }}><IconX size={13} color="currentColor" /></button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Servers */}
                      <div>
                        <div style={{ fontSize: 11, color: t.textDim, marginBottom: 6 }}>СЕРВЕРИ</div>
                        {(g.configs || []).length === 0 && <div style={{ fontSize: 11, color: t.textDim }}>{l.noGroupServers}</div>}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(g.configs || []).map(c => (
                            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: t.bg2, borderRadius: 4, padding: "5px 10px" }}>
                              <div>
                                <span style={{ fontSize: 12, color: t.text }}>{c.label}</span>
                                <span style={{ fontSize: 10, color: t.textDim, marginLeft: 8 }}>{c.host}:{c.port}</span>
                                <span style={{ fontSize: 10, color: t.accent, marginLeft: 8 }}>{ACCESS_LABELS[(c.access_role || "operator") as AccessRole]}</span>
                              </div>
                              {isManager && (
                                <button onClick={() => removeServerFromGroup(g.id, c.id)}
                                  style={{ background: "transparent", border: "none", color: t.red, cursor: "pointer", padding: "0 4px", display: "flex", alignItems: "center" }}><IconX size={13} color="currentColor" /></button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "invites" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {invites.length === 0 && (
              <div style={{ textAlign: "center", color: t.textDim, fontSize: 13, padding: "40px 0" }}>
                {l.noInvites}
              </div>
            )}
            {invites.map(inv => (
              <div key={inv.id} style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 6, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, color: t.text }}>{inv.group_name}</div>
                    {inv.group_description && <div style={{ fontSize: 11, color: t.textDim }}>{inv.group_description}</div>}
                    <div style={{ fontSize: 11, color: t.textDim, marginTop: 3 }}>від @{inv.from_username}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => respondInvite(inv.id, "accept")}
                      style={{ background: t.green || "#4caf50", border: "none", borderRadius: 4, padding: "5px 12px", fontSize: 11, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                      Прийняти
                    </button>
                    <button onClick={() => respondInvite(inv.id, "decline")}
                      style={{ background: t.bg2, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "5px 12px", fontSize: 11, color: t.textDim, cursor: "pointer", fontFamily: "inherit" }}>
                      Відхилити
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create group modal */}
      {showCreate && (
        <Modal t={t} title={l.createGroup} onClose={() => setShowCreate(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
            <Input t={t} placeholder="Назва групи" value={newGroup.name} onChange={v => setNewGroup(f => ({ ...f, name: v }))} />
            <Input t={t} placeholder="Опис (необов'язково)" value={newGroup.description} onChange={v => setNewGroup(f => ({ ...f, description: v }))} />

            <div style={{ borderTop: `1px solid ${t.border2}`, paddingTop: 10, marginTop: 2 }}>
              <div style={{ fontSize: 10, color: t.textDim, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>
                Провіжнінг (необов'язково)
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  <label style={{ fontSize: 10, color: t.textDim }}>Цільовий сервер</label>
                  <select
                    value={newGroup.provision_config_id}
                    onChange={e => setNewGroup(f => ({ ...f, provision_config_id: e.target.value }))}
                    style={{ background: t.bg2, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "7px 10px", color: t.text, fontFamily: "inherit", fontSize: 12, outline: "none" }}
                  >
                    <option value="">— не вказано —</option>
                    {myConfigs.map(c => (
                      <option key={c.id} value={c.id}>{c.label || c.host} ({c.host})</option>
                    ))}
                  </select>
                </div>
                <Input t={t} placeholder="Директорія, напр. /home/jefrex/minecraft" value={newGroup.provision_root_path} onChange={v => setNewGroup(f => ({ ...f, provision_root_path: v }))} />
              </div>
            </div>

            {createError && <div style={{ fontSize: 12, color: t.red }}>{createError}</div>}
            <button onClick={createGroup} style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: "8px 0", fontSize: 12, color: t.accent, cursor: "pointer", fontFamily: "inherit" }}>
              {l.create}
            </button>
          </div>
        </Modal>
      )}

      {/* Invite modal */}
      {inviteModal && (
        <Modal t={t} title={`Запросити в "${inviteModal.groupName}"`} onClose={() => { setInviteModal(null); setInviteMsg(""); setInviteTarget(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
            <div style={{ fontSize: 11, color: t.textDim }}>Введіть імʼя користувача або ID акаунта</div>
            <Input t={t} placeholder="username або ID" value={inviteTarget} onChange={v => setInviteTarget(v)}
              onKeyDown={e => { if (e.key === "Enter") sendInvite(); }} />
            {inviteMsg && <div style={{ fontSize: 12, color: inviteMsg.startsWith("✓") ? (t.green || "#4caf50") : t.red }}>{inviteMsg}</div>}
            <button onClick={sendInvite} style={{ background: t.red, border: "none", borderRadius: 4, padding: "8px 0", fontSize: 12, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
              Надіслати запит
            </button>
          </div>
        </Modal>
      )}

      {/* Add server to group modal */}
      {addServerModal && (
        <Modal t={t} title={`${l.addServer}: "${addServerModal.groupName}"`} onClose={() => setAddServerModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0", maxHeight: 320, overflowY: "auto" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: t.textDim }}>
              {language === "uk" ? "Права доступу" : "Access role"}
              <select
                value={serverAccessRole}
                onChange={(e) => setServerAccessRole(e.target.value as AccessRole)}
                style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "7px 10px", fontSize: 12, color: t.text, fontFamily: "inherit" }}
              >
                <option value="admin">{l.roleAdmin}</option>
                <option value="operator">{l.roleOperator}</option>
                <option value="observer">{l.roleObserver}</option>
              </select>
            </label>
            {myConfigs.length === 0 && <div style={{ fontSize: 12, color: t.textDim }}>У вас немає серверів. Додайте спочатку сервер.</div>}
            {myConfigs.map(c => {
              const g = groups.find(gr => gr.id === addServerModal.groupId);
              const alreadyAdded = (g?.configs || []).find(gc => gc.id === c.id);
              return (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: t.bg4, borderRadius: 4, padding: "8px 10px" }}>
                  <div>
                    <div style={{ fontSize: 12, color: t.text }}>{c.label}</div>
                    <div style={{ fontSize: 10, color: t.textDim }}>{c.host}:{c.port}</div>
                  </div>
                  {alreadyAdded ? (
                    <span style={{ fontSize: 10, color: t.textDim }}>Вже додано</span>
                  ) : (
                    <button onClick={() => { addServerToGroup(addServerModal.groupId, c.id!, serverAccessRole); }}
                      style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: t.accent, cursor: "pointer", fontFamily: "inherit" }}>
                      + {l.add}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Provision modal — тільки для власника групи */}
      {provisionModal && (
        <Modal t={t} title={`Provision — "${provisionModal.groupName}"`} onClose={() => { setProvisionModal(null); setProvisionMsg(null); setSudoPassword(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 0" }}>
            <div style={{ fontSize: 11, color: t.textDim, lineHeight: 1.6 }}>
              Створить Linux-юзера <code style={{ color: t.red }}>vt_group_*</code> на сервері,
              директорію і SSH-ключ для групи. Члени бачитимуть тільки свою папку.
            </div>

            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <label style={{ fontSize: 10, color: t.textDim, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                Цільовий сервер
              </label>
              <select
                value={provisionModal.provision_config_id}
                onChange={e => {
                  const cfgId = e.target.value;
                  const cfg = myConfigs.find(c => String(c.id) === cfgId);
                  // Автоматично підставляємо домашню папку юзера як дефолт
                  const defaultPath = cfg ? `/home/${cfg.username}` : "";
                  setProvisionModal(m => m ? { ...m, provision_config_id: cfgId, provision_root_path: m.provision_root_path || defaultPath } : m);
                }}
                style={{ background: t.bg2, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "7px 10px", color: t.text, fontFamily: "inherit", fontSize: 12, outline: "none" }}
              >
                <option value="">— виберіть сервер —</option>
                {myConfigs.map(c => (
                  <option key={c.id} value={c.id}>{c.label || c.host} ({c.host})</option>
                ))}
              </select>
            </div>

            <Input
              t={t}
              placeholder={(() => { const cfg = myConfigs.find(c => String(c.id) === provisionModal.provision_config_id); return cfg ? `/home/${cfg.username}` : "Директорія (дефолт: /home/<user>)"; })()}
              value={provisionModal.provision_root_path}
              onChange={v => setProvisionModal(m => m ? { ...m, provision_root_path: v } : m)}
            />

            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <label style={{ fontSize: 10, color: t.textDim, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                Sudo пароль (якщо потрібен для useradd/groupadd)
              </label>
              <input
                type="password"
                value={sudoPassword}
                onChange={e => setSudoPassword(e.target.value)}
                placeholder="залиш порожнім якщо sudo без пароля"
                style={{ background: t.bg2, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "7px 10px", color: t.text, fontFamily: "inherit", fontSize: 12, outline: "none" }}
              />
            </div>

            {provisionMsg && (
              <div style={{ fontSize: 12, color: provisionMsg.ok ? (t.green || "#4caf50") : t.red, lineHeight: 1.5 }}>
                {provisionMsg.text}
              </div>
            )}

            <button
              onClick={runProvision}
              disabled={provisionLoading}
              style={{ background: t.red, border: "none", borderRadius: 4, padding: "8px 0", fontSize: 12, color: "#fff", cursor: provisionLoading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: provisionLoading ? 0.6 : 1 }}
            >
              {provisionLoading ? "Провіжнінг…" : "Запустити Provision"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

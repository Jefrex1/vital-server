"use client";

import React, { useState, useEffect } from "react";
import { GroupRow, UserRow, SSHConfig } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";

interface GroupsTabProps {
  token: string;
  t: typeof THEMES.dark;
  onRefresh: () => void;
}

export function GroupsTab({ token, t, onRefresh }: GroupsTabProps) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [allConfigs, setAllConfigs] = useState<SSHConfig[]>([]);
  const [newGroup, setNewGroup] = useState({ name: "", description: "", provision_config_id: "", provision_root_path: "" });
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [provisionModal, setProvisionModal] = useState<{ groupId: number; groupName: string; provision_config_id: string; provision_root_path: string } | null>(null);
  const [provisionMsg, setProvisionMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [provisionLoading, setProvisionLoading] = useState(false);
  const [inviteModal, setInviteModal] = useState<{ groupId: number; groupName: string } | null>(null);
  const [inviteTarget, setInviteTarget] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");

  const hdr = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  async function load() {
    const [gRes, uRes, cRes] = await Promise.all([
      fetch(`${API}/groups`, { headers: hdr }),
      fetch(`${API}/users`, { headers: hdr }),
      fetch(`${API}/configs`, { headers: hdr }),
    ]);
    if (gRes.ok) setGroups(await gRes.json());
    if (uRes.ok) setUsers(await uRes.json());
    if (cRes.ok) setAllConfigs(await cRes.json());
  }

  useEffect(() => { load(); }, [token]);

  async function createGroup() {
    const body: any = { name: newGroup.name, description: newGroup.description };
    if (newGroup.provision_config_id) body.provision_config_id = Number(newGroup.provision_config_id);
    if (newGroup.provision_root_path) body.provision_root_path = newGroup.provision_root_path;
    const res = await fetch(`${API}/groups`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setShowNewGroup(false);
      setNewGroup({ name: "", description: "", provision_config_id: "", provision_root_path: "" });
      load();
      onRefresh();
    }
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
      }),
    });
    const data = await res.json();
    setProvisionLoading(false);
    if (res.ok) {
      setProvisionMsg({ text: `✓ Provisioned! Linux user: ${data.linux_user}, path: ${data.root_path}`, ok: true });
      load(); onRefresh();
    } else {
      setProvisionMsg({ text: "✕ " + data.error, ok: false });
    }
  }

  async function deleteGroup(id: number) {
    if (!confirm("Delete group?")) return;
    await fetch(`${API}/groups/${id}`, { method: "DELETE", headers: hdr });
    load();
    onRefresh();
  }

  async function addMember(groupId: number, userId: number) {
    await fetch(`${API}/groups/${groupId}/members`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify({ user_id: userId }),
    });
    load();
    onRefresh();
  }

  async function removeMember(groupId: number, userId: number) {
    await fetch(`${API}/groups/${groupId}/members/${userId}`, {
      method: "DELETE",
      headers: hdr,
    });
    load();
    onRefresh();
  }

  async function addConfig(groupId: number, configId: number) {
    await fetch(`${API}/groups/${groupId}/configs`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify({ config_id: configId }),
    });
    load();
    onRefresh();
  }

  async function removeConfig(groupId: number, configId: number) {
    await fetch(`${API}/groups/${groupId}/configs/${configId}`, {
      method: "DELETE",
      headers: hdr,
    });
    load();
    onRefresh();
  }

  async function sendInvite() {
    if (!inviteModal || !inviteTarget) return;
    setInviteMsg("");
    const isId = /^\d+$/.test(inviteTarget);
    const body = isId ? { user_id: Number(inviteTarget) } : { username: inviteTarget };
    const res = await fetch(`${API}/groups/${inviteModal.groupId}/invite`, {
      method: "POST", headers: hdr, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setInviteMsg("✓ Запит надіслано!");
      setInviteTarget("");
      setTimeout(() => { setInviteModal(null); setInviteMsg(""); }, 1500);
    } else {
      setInviteMsg("✕ " + data.error);
    }
  }

  const tagStyle = (color: string, borderColor: string): React.CSSProperties => ({
    background: t.tagBg,
    border: `1px solid ${borderColor}`,
    color: color,
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    gap: 5,
  });

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    color: t.textDim,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 6,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: t.text }}>Groups</span>
        <button
          onClick={() => setShowNewGroup(true)}
          style={{
            background: t.accentBg,
            border: `1px solid ${t.accentBorder}`,
            borderRadius: 4,
            padding: "6px 14px",
            fontSize: 12,
            color: t.accent,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + New group
        </button>
      </div>

      {groups.length === 0 && (
        <div style={{ fontSize: 12, color: t.textDim, padding: "10px 0" }}>
          No groups yet. Create one above.
        </div>
      )}

      {groups.map((g) => {
        const groupConfigIds = new Set((g as any).configs?.map((c: any) => c.id) ?? []);
        const availableConfigs = allConfigs.filter((c) => !groupConfigIds.has(c.id));

        return (
          <div
            key={g.id}
            style={{
              background: t.tableBg,
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 13, color: t.text }}>{g.name}</span>
                {g.description && (
                  <span style={{ fontSize: 11, color: t.textDim, marginLeft: 10 }}>
                    {g.description}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setProvisionModal({ groupId: g.id, groupName: g.name, provision_config_id: String((g as any).provision_config_id || ""), provision_root_path: (g as any).provision_root_path || "" })}
                  style={{ background: (g as any).provisioned_at ? t.tagBg : t.accentBg, border: `1px solid ${(g as any).provisioned_at ? t.border : t.accentBorder}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: (g as any).provisioned_at ? t.green : t.accent, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {(g as any).provisioned_at ? "⚙ Provisioned" : "⚙ Provision"}
                </button>
                <button
                  onClick={() => { setInviteModal({ groupId: g.id, groupName: g.name }); setInviteTarget(""); setInviteMsg(""); }}
                  style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: t.accent, cursor: "pointer", fontFamily: "inherit" }}
                >
                  + Запросити
                </button>
                <button
                  onClick={() => deleteGroup(g.id)}
                  style={{ background: "none", border: "none", color: t.textDim, cursor: "pointer", fontSize: 13 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = t.red)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = t.textDim)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Members section */}
            <div>
              <div style={sectionLabel}>Members</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {g.members.length === 0 && (
                  <span style={{ fontSize: 11, color: t.textDim }}>No members</span>
                )}
                {g.members.map((m) => (
                  <span key={m.id} style={tagStyle(t.tagColor, t.tagBorder)}>
                    {m.username}
                    {m.role === "admin" && (
                      <span style={{ fontSize: 9, color: t.yellow, marginLeft: 2 }}>admin</span>
                    )}
                    <span
                      onClick={() => removeMember(g.id, m.id)}
                      style={{ cursor: "pointer", opacity: 0.6, lineHeight: 1 }}
                    >
                      ✕
                    </span>
                  </span>
                ))}
              </div>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addMember(g.id, Number(e.target.value));
                    e.target.value = "";
                  }
                }}
                style={{
                  background: t.inputBg,
                  border: `1px solid ${t.border2}`,
                  borderRadius: 4,
                  padding: "5px 10px",
                  color: t.text,
                  fontFamily: "inherit",
                  fontSize: 12,
                  outline: "none",
                }}
              >
                <option value="">+ Add member…</option>
                {users
                  .filter((u) => !g.members.some((m) => m.id === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.role})
                    </option>
                  ))}
              </select>
            </div>

            {/* Servers section */}
            <div>
              <div style={sectionLabel}>Servers (accessible to group members)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {((g as any).configs ?? []).length === 0 && (
                  <span style={{ fontSize: 11, color: t.textDim }}>No servers assigned</span>
                )}
                {((g as any).configs ?? []).map((c: any) => (
                  <span key={c.id} style={tagStyle(t.green, t.green + "44")}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
                      <line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
                    </svg>
                    {c.label || c.host}
                    <span style={{ fontSize: 9, color: t.textDim }}>
                      {c.username}@{c.host}:{c.port}
                    </span>
                    <span
                      onClick={() => removeConfig(g.id, c.id)}
                      style={{ cursor: "pointer", opacity: 0.6, lineHeight: 1 }}
                    >
                      ✕
                    </span>
                  </span>
                ))}
              </div>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addConfig(g.id, Number(e.target.value));
                    e.target.value = "";
                  }
                }}
                style={{
                  background: t.inputBg,
                  border: `1px solid ${t.border2}`,
                  borderRadius: 4,
                  padding: "5px 10px",
                  color: t.text,
                  fontFamily: "inherit",
                  fontSize: 12,
                  outline: "none",
                }}
              >
                <option value="">+ Add server…</option>
                {availableConfigs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label || c.host} — {c.username}@{c.host}:{c.port}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}

      {showNewGroup && (
        <Modal title="Create group" onClose={() => setShowNewGroup(false)} t={t}>
          <Input
            label="Name"
            value={newGroup.name}
            onChange={(v) => setNewGroup((g) => ({ ...g, name: v }))}
            t={t}
          />
          <Input
            label="Description (optional)"
            value={newGroup.description}
            onChange={(v) => setNewGroup((g) => ({ ...g, description: v }))}
            t={t}
          />
          <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 12, marginTop: 4 }}>
            <div style={{ fontSize: 10, color: t.textDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Provisioning (optional)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 10, color: t.textDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Target server (SSH Config ID)
                </label>
                <select
                  value={newGroup.provision_config_id}
                  onChange={(e) => setNewGroup((g) => ({ ...g, provision_config_id: e.target.value }))}
                  style={{ background: t.inputBg, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "8px 10px", color: t.text, fontFamily: "inherit", fontSize: 13, outline: "none" }}
                >
                  <option value="">— not set —</option>
                  {allConfigs.map((c) => (
                    <option key={c.id} value={c.id}>{c.label || c.host} ({c.username}@{c.host})</option>
                  ))}
                </select>
              </div>
              <Input
                label="Root directory (e.g. /home/jefrex/minecraft)"
                value={newGroup.provision_root_path}
                onChange={(v) => setNewGroup((g) => ({ ...g, provision_root_path: v }))}
                t={t}
              />
            </div>
          </div>
          <button
            onClick={createGroup}
            style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: "9px", fontSize: 13, color: t.accent, cursor: "pointer", fontFamily: "inherit" }}
          >
            Create
          </button>
        </Modal>
      )}

      {provisionModal && (
        <Modal title={`Provision — "${provisionModal.groupName}"`} onClose={() => { setProvisionModal(null); setProvisionMsg(null); }} t={t} width={480}>
          <div style={{ fontSize: 12, color: t.textDim, lineHeight: 1.6 }}>
            Це створить Linux-юзера <code style={{ color: t.accent }}>vt_group_*</code> на цільовому сервері,
            директорію, та SSH-ключ для групи. Члени групи будуть обмежені цією директорією.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 10, color: t.textDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Target server (root/sudo access required)
              </label>
              <select
                value={provisionModal.provision_config_id}
                onChange={(e) => setProvisionModal((m) => m ? { ...m, provision_config_id: e.target.value } : m)}
                style={{ background: t.inputBg, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "8px 10px", color: t.text, fontFamily: "inherit", fontSize: 13, outline: "none" }}
              >
                <option value="">— select server —</option>
                {allConfigs.map((c) => (
                  <option key={c.id} value={c.id}>{c.label || c.host} ({c.username}@{c.host})</option>
                ))}
              </select>
            </div>
            <Input
              label="Root directory"
              value={provisionModal.provision_root_path}
              onChange={(v) => setProvisionModal((m) => m ? { ...m, provision_root_path: v } : m)}
              t={t}
            />
          </div>
          {provisionMsg && (
            <div style={{ fontSize: 12, color: provisionMsg.ok ? t.green : t.red, lineHeight: 1.5 }}>
              {provisionMsg.text}
            </div>
          )}
          <button
            onClick={runProvision}
            disabled={provisionLoading}
            style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: "9px", fontSize: 13, color: t.accent, cursor: provisionLoading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: provisionLoading ? 0.6 : 1 }}
          >
            {provisionLoading ? "Provisioning…" : "Run Provision"}
          </button>
        </Modal>
      )}

      {inviteModal && (
        <Modal title={`Запросити в "${inviteModal.groupName}"`} onClose={() => { setInviteModal(null); setInviteMsg(""); setInviteTarget(""); }} t={t}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, color: t.textDim }}>Введіть ім'я або ID користувача</div>
            <Input
              label="Username або ID"
              value={inviteTarget}
              onChange={(v) => setInviteTarget(v)}
              t={t}
            />
            {inviteMsg && (
              <div style={{ fontSize: 12, color: inviteMsg.startsWith("✓") ? t.green : t.red }}>{inviteMsg}</div>
            )}
            <button
              onClick={sendInvite}
              style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: "9px", fontSize: 13, color: t.accent, cursor: "pointer", fontFamily: "inherit" }}
            >
              Надіслати запит
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
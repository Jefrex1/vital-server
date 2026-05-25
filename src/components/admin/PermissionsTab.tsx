"use client";

import React, { useEffect, useState } from "react";
import { PermRow } from "@/types";
import { API, THEMES } from "@/constants/themes";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { IconCheck, IconX } from "../ui/Icons";

interface PermissionsTabProps {
  token: string;
  t: typeof THEMES.dark;
  onRefresh: () => void;
}

export function PermissionsTab({ token, t, onRefresh }: PermissionsTabProps) {
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [showNewPerm, setShowNewPerm] = useState(false);
  const [newPerm, setNewPerm] = useState({
    target_type: "group",
    target_id: "",
    config_id: "",
    can_read: true,
    can_write: false,
    can_delete: false,
    can_terminal: false,
    can_upload: false,
    root_path: "",
  });

  const hdr = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  async function load() {
    const res = await fetch(`${API}/permissions`, { headers: hdr });
    if (res.ok) setPerms(await res.json());
  }

  useEffect(() => {
    load();
  }, [token]);

  async function createPerm() {
    const res = await fetch(`${API}/permissions`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify({
        ...newPerm,
        target_id: Number(newPerm.target_id),
        config_id: newPerm.config_id ? Number(newPerm.config_id) : null,
        root_path: newPerm.root_path || null,
      }),
    });
    if (res.ok) {
      setShowNewPerm(false);
      setNewPerm({ target_type: "group", target_id: "", config_id: "", can_read: true, can_write: false, can_delete: false, can_terminal: false, can_upload: false, root_path: "" });
      load();
      onRefresh();
    }
  }

  async function deletePerm(id: number) {
    await fetch(`${API}/permissions/${id}`, { method: "DELETE", headers: hdr });
    load();
    onRefresh();
  }

  const th = (label: string) => (
    <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: t.textDim, letterSpacing: "0.06em", textTransform: "uppercase", background: t.tableHeader, fontWeight: 500 }}>
      {label}
    </th>
  );

  const cell = (content: React.ReactNode, w?: number | string) => (
    <td style={{ padding: "8px 12px", borderBottom: `1px solid ${t.border}`, fontSize: 12, color: t.textMid, whiteSpace: "nowrap", width: w }}>
      {content}
    </td>
  );

  const flag = (v: number) => (
    <span style={{ color: v ? t.green : t.textDim, display: "inline-flex", alignItems: "center" }}>
      {v ? <IconCheck size={12} color="currentColor" /> : "-"}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: t.text }}>Access rules</span>
        <button onClick={() => setShowNewPerm(true)} style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: "6px 14px", fontSize: 12, color: t.accent, cursor: "pointer", fontFamily: "inherit" }}>
          + New rule
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", background: t.tableBg, borderRadius: 6, overflow: "hidden" }}>
        <thead>
          <tr>
            {th("ID")}
            {th("Target")}
            {th("Config")}
            {th("Read")}
            {th("Write")}
            {th("Delete")}
            {th("Terminal")}
            {th("Upload")}
            {th("Root path")}
            {th("")}
          </tr>
        </thead>
        <tbody>
          {perms.map((p) => (
            <tr key={p.id}>
              {cell(p.id, 40)}
              {cell(`${p.target_type}:${p.target_id}`)}
              {cell(p.config_id ?? "all")}
              {cell(flag(p.can_read))}
              {cell(flag(p.can_write))}
              {cell(flag(p.can_delete))}
              {cell(flag(p.can_terminal))}
              {cell(flag(p.can_upload))}
              {cell(<span style={{ color: p.root_path ? t.accent : t.textDim, fontFamily: "monospace", fontSize: 11 }}>{p.root_path || "-"}</span>)}
              {cell(
                <button onClick={() => deletePerm(p.id)} style={{ background: "none", border: "none", color: t.textDim, cursor: "pointer", fontSize: 13 }}>
                  <IconX size={13} color="currentColor" />
                </button>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {showNewPerm && (
        <Modal title="Create access rule" onClose={() => setShowNewPerm(false)} t={t} width={460}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 10, color: t.textDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Target type
              <select value={newPerm.target_type} onChange={(e) => setNewPerm((p) => ({ ...p, target_type: e.target.value }))} style={{ background: t.inputBg, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "8px 10px", color: t.text, fontFamily: "inherit", fontSize: 13, outline: "none" }}>
                <option value="user">user</option>
                <option value="group">group</option>
              </select>
            </label>
            <Input label="Target ID" value={newPerm.target_id} onChange={(v) => setNewPerm((p) => ({ ...p, target_id: v }))} type="number" t={t} />
            <Input label="Config ID (blank = all)" value={newPerm.config_id} onChange={(v) => setNewPerm((p) => ({ ...p, config_id: v }))} type="number" t={t} />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["can_read", "can_write", "can_delete", "can_terminal", "can_upload"] as const).map((k) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.textMid, cursor: "pointer" }}>
                <input type="checkbox" checked={newPerm[k]} onChange={(e) => setNewPerm((p) => ({ ...p, [k]: e.target.checked }))} />
                {k.replace("can_", "")}
              </label>
            ))}
          </div>

          <Input label="Root path (optional)" value={newPerm.root_path} onChange={(v) => setNewPerm((p) => ({ ...p, root_path: v }))} t={t} />
          <button onClick={createPerm} style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: "9px", fontSize: 13, color: t.accent, cursor: "pointer", fontFamily: "inherit" }}>
            Create
          </button>
        </Modal>
      )}
    </div>
  );
}

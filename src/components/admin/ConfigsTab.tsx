"use client";

import React, { useState, useEffect } from "react";
import { SSHConfig } from "@/types";
import { THEMES, API } from "@/constants/themes";

interface ConfigsTabProps {
  token: string;
  t: typeof THEMES.dark;
}

export function ConfigsTab({
  token,
  t,
}: ConfigsTabProps) {
  const [configs, setConfigs] = useState<SSHConfig[]>([]);

  const hdr = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    async function load() {
      const res = await fetch(`${API}/configs`, {
        headers: hdr,
      });
      if (res.ok) {
        setConfigs(await res.json());
      }
    }
    load();
  }, [token]);

  const th = (label: string) => (
    <th
      style={{
        padding: "8px 12px",
        textAlign: "left",
        fontSize: 10,
        color: t.textDim,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        background: t.tableHeader,
        fontWeight: 500,
      }}
    >
      {label}
    </th>
  );

  const cell = (content: React.ReactNode, w?: number | string) => (
    <td
      style={{
        padding: "8px 12px",
        borderBottom: `1px solid ${t.border}`,
        fontSize: 12,
        color: t.textMid,
        whiteSpace: "nowrap",
        width: w,
      }}
    >
      {content}
    </td>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <span style={{ fontSize: 14, color: t.text }}>
        SSH Configs
      </span>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          background: t.tableBg,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <thead>
          <tr>
            {th("ID")}
            {th("Label")}
            {th("Host")}
            {th("User")}
            {th("Auth")}
            {th("Owner")}
          </tr>
        </thead>
        <tbody>
          {configs.map((c) => (
            <tr key={c.id}>
              {cell(c.id, 40)}
              {cell(c.label || "—")}
              {cell(`${c.host}:${c.port}`)}
              {cell(c.username)}
              {cell(c.auth_type)}
              {cell(
                c.group_id ? `group:${c.group_id}` : "personal"
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { AuditRow } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { tsToStr } from "@/utils/helpers";
import { IconArrowLeft, IconArrowRight } from "../ui/Icons";

interface AuditTabProps {
  token: string;
  t: typeof THEMES.dark;
}

export function AuditTab({
  token,
  t,
}: AuditTabProps) {
  const [audit, setAudit] = useState<{
    rows: AuditRow[];
    total: number;
  }>({ rows: [], total: 0 });
  const [offset, setOffset] = useState(0);

  const hdr = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    async function load() {
      const res = await fetch(
        `${API}/audit?limit=50&offset=${offset}`,
        { headers: hdr }
      );
      if (res.ok) {
        setAudit(await res.json());
      }
    }
    load();
  }, [offset, token]);

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 14, color: t.text }}>
          Audit log{" "}
          <span style={{ fontSize: 11, color: t.textDim }}>
            ({audit.total} total)
          </span>
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            disabled={offset === 0}
            onClick={() =>
              setOffset((o) => Math.max(0, o - 50))
            }
            style={{
              background: t.bg4,
              border: `1px solid ${t.border2}`,
              borderRadius: 4,
              padding: "5px 12px",
              fontSize: 12,
              color: t.textMid,
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: offset === 0 ? 0.4 : 1,
            }}
          >
            <IconArrowLeft size={12} color="currentColor" style={{ marginRight: 4 }} /> Prev
          </button>
          <button
            disabled={offset + 50 >= audit.total}
            onClick={() =>
              setOffset((o) => o + 50)
            }
            style={{
              background: t.bg4,
              border: `1px solid ${t.border2}`,
              borderRadius: 4,
              padding: "5px 12px",
              fontSize: 12,
              color: t.textMid,
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: offset + 50 >= audit.total ? 0.4 : 1,
            }}
          >
            Next <IconArrowRight size={12} color="currentColor" style={{ marginLeft: 4 }} />
          </button>
        </div>
      </div>

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
            {th("Time")}
            {th("User")}
            {th("Action")}
            {th("Target")}
            {th("Detail")}
            {th("IP")}
          </tr>
        </thead>
        <tbody>
          {audit.rows.map((r) => (
            <tr key={r.id}>
              {cell(tsToStr(r.created_at))}
              {cell(r.username || "—")}
              {cell(
                <span
                  style={{
                    color: r.action.includes("delete")
                      ? t.red
                      : r.action.includes("login")
                        ? t.green
                        : t.accent,
                    fontSize: 11,
                  }}
                >
                  {r.action}
                </span>
              )}
              {cell(r.target || "—")}
              {cell(r.detail || "—")}
              {cell(r.ip || "—")}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

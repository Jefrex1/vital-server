"use client";

import React, { useState } from "react";
import { AdminTab } from "@/types";
import { THEMES } from "@/constants/themes";
import { UsersTab } from "./admin/UsersTab";
import { GroupsTab } from "./admin/GroupsTab";
import { ConfigsTab } from "./admin/ConfigsTab";
import { PermissionsTab } from "./admin/PermissionsTab";
import { AuditTab } from "./admin/AuditTab";

interface AdminPanelProps {
  token: string;
  t: typeof THEMES.dark;
  onClose: () => void;
}

export function AdminPanel({
  token,
  t,
  onClose,
}: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>("users");
  const [refreshKey, setRefreshKey] = useState(0);

  const TABS: { key: AdminTab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "groups", label: "Groups" },
    { key: "configs", label: "Configs" },
    { key: "permissions", label: "Permissions" },
    { key: "audit", label: "Audit log" },
  ];

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: t.bg,
        zIndex: 500,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Roboto Mono',monospace",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: t.topbarBg,
          borderBottom: `1px solid ${t.border}`,
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: t.textDim,
            cursor: "pointer",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "inherit",
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <span style={{ fontSize: 14, color: t.text }}>
          oServer Admin
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar */}
        <div
          style={{
            width: 160,
            background: t.bg2,
            borderRight: `1px solid ${t.border}`,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          {TABS.map(({ key, label }) => (
            <div
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "10px 16px",
                fontSize: 13,
                cursor: "pointer",
                color:
                  tab === key ? t.sidebarActiveColor : t.textDim,
                background:
                  tab === key ? t.sidebarActiveBg : "transparent",
                borderLeft: `2px solid ${
                  tab === key
                    ? t.sidebarActiveBorder
                    : "transparent"
                }`,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: 20,
          }}
          key={refreshKey}
        >
          {tab === "users" && (
            <UsersTab
              token={token}
              t={t}
              loading={false}
              onRefresh={handleRefresh}
            />
          )}
          {tab === "groups" && (
            <GroupsTab
              token={token}
              t={t}
              onRefresh={handleRefresh}
            />
          )}
          {tab === "configs" && (
            <ConfigsTab token={token} t={t} />
          )}
          {tab === "permissions" && (
            <PermissionsTab
              token={token}
              t={t}
              onRefresh={handleRefresh}
            />
          )}
          {tab === "audit" && (
            <AuditTab token={token} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

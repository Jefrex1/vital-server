"use client";

import React, { useState, useEffect } from "react";
import { UserRow } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { tsToStr } from "@/utils/helpers";

interface UsersTabProps {
  token: string;
  t: typeof THEMES.dark;
  loading: boolean;
  onRefresh: () => void;
}

export function UsersTab({
  token,
  t,
  loading,
  onRefresh,
}: UsersTabProps) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "user",
  });
  const [showNewUser, setShowNewUser] = useState(false);

  const hdr = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    async function load() {
      const res = await fetch(`${API}/users`, { headers: hdr });
      if (res.ok) {
        setUsers(await res.json());
      }
    }
    load();
  }, [token]);

  async function createUser() {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify(newUser),
    });
    if (res.ok) {
      setShowNewUser(false);
      setNewUser({ username: "", password: "", role: "user" });
      onRefresh();
    }
  }

  async function deleteUser(id: number) {
    if (!confirm("Delete user?")) return;
    await fetch(`${API}/users/${id}`, {
      method: "DELETE",
      headers: hdr,
    });
    onRefresh();
  }

  async function toggleRole(u: UserRow) {
    const newRole = u.role === "admin" ? "user" : "admin";
    await fetch(`${API}/users/${u.id}`, {
      method: "PATCH",
      headers: hdr,
      body: JSON.stringify({ role: newRole }),
    });
    onRefresh();
  }

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
        <span style={{ fontSize: 14, color: t.text }}>Users</span>
        <button
          onClick={() => setShowNewUser(true)}
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
          + New user
        </button>
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
            {th("ID")}
            {th("Username")}
            {th("Role")}
            {th("Created")}
            {th("Last login")}
            {th("")}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              {cell(u.id, 40)}
              {cell(u.username)}
              {cell(
                <span
                  onClick={() => toggleRole(u)}
                  style={{
                    cursor: "pointer",
                    color:
                      u.role === "admin" ? t.yellow : t.green,
                    fontSize: 11,
                    border: `1px solid ${
                      u.role === "admin" ? t.yellow : t.green
                    }`,
                    borderRadius: 3,
                    padding: "2px 7px",
                  }}
                >
                  {u.role}
                </span>
              )}
              {cell(tsToStr(u.created_at))}
              {cell(
                u.last_login
                  ? tsToStr(u.last_login)
                  : "—"
              )}
              {cell(
                <button
                  onClick={() => deleteUser(u.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: t.textDim,
                    cursor: "pointer",
                    fontSize: 13,
                    padding: "2px 6px",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = t.red)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = t.textDim)
                  }
                >
                  ✕
                </button>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {showNewUser && (
        <Modal
          title="Create user"
          onClose={() => setShowNewUser(false)}
          t={t}
        >
          <Input
            label="Username"
            value={newUser.username}
            onChange={(v) =>
              setNewUser((u) => ({
                ...u,
                username: v,
              }))
            }
            t={t}
          />
          <Input
            label="Password"
            value={newUser.password}
            onChange={(v) =>
              setNewUser((u) => ({
                ...u,
                password: v,
              }))
            }
            type="password"
            t={t}
          />
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
              Role
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {["user", "admin"].map((r) => (
                <button
                  key={r}
                  onClick={() =>
                    setNewUser((u) => ({
                      ...u,
                      role: r,
                    }))
                  }
                  style={{
                    flex: 1,
                    background:
                      newUser.role === r
                        ? t.accentBg
                        : t.bg4,
                    border: `1px solid ${
                      newUser.role === r
                        ? t.accentBorder
                        : t.border2
                    }`,
                    borderRadius: 4,
                    padding: "7px",
                    fontSize: 12,
                    color:
                      newUser.role === r
                        ? t.accent
                        : t.textMid,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={createUser}
            style={{
              background: t.accentBg,
              border: `1px solid ${t.accentBorder}`,
              borderRadius: 4,
              padding: "9px",
              fontSize: 13,
              color: t.accent,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Create
          </button>
        </Modal>
      )}
    </div>
  );
}

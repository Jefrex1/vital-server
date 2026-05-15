"use client";

import React, { useState, useEffect } from "react";
import { GroupRow, UserRow } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";

interface GroupsTabProps {
  token: string;
  t: typeof THEMES.dark;
  onRefresh: () => void;
}

export function GroupsTab({
  token,
  t,
  onRefresh,
}: GroupsTabProps) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
  });
  const [showNewGroup, setShowNewGroup] = useState(false);

  const hdr = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    async function load() {
      const res = await fetch(`${API}/groups`, { headers: hdr });
      if (res.ok) setGroups(await res.json());

      const userRes = await fetch(`${API}/users`, {
        headers: hdr,
      });
      if (userRes.ok) setUsers(await userRes.json());
    }
    load();
  }, [token]);

  async function createGroup() {
    const res = await fetch(`${API}/groups`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify(newGroup),
    });
    if (res.ok) {
      setShowNewGroup(false);
      setNewGroup({ name: "", description: "" });
      onRefresh();
    }
  }

  async function deleteGroup(id: number) {
    if (!confirm("Delete group?")) return;
    await fetch(`${API}/groups/${id}`, {
      method: "DELETE",
      headers: hdr,
    });
    onRefresh();
  }

  async function addMember(groupId: number, userId: number) {
    await fetch(`${API}/groups/${groupId}/members`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify({ user_id: userId }),
    });
    onRefresh();
  }

  async function removeMember(
    groupId: number,
    userId: number
  ) {
    await fetch(
      `${API}/groups/${groupId}/members/${userId}`,
      { method: "DELETE", headers: hdr }
    );
    onRefresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
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

      {groups.map((g) => (
        <div
          key={g.id}
          style={{
            background: t.tableBg,
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div>
              <span style={{ fontSize: 13, color: t.text }}>
                {g.name}
              </span>
              {g.description && (
                <span
                  style={{
                    fontSize: 11,
                    color: t.textDim,
                    marginLeft: 10,
                  }}
                >
                  {g.description}
                </span>
              )}
            </div>
            <button
              onClick={() => deleteGroup(g.id)}
              style={{
                background: "none",
                border: "none",
                color: t.textDim,
                cursor: "pointer",
                fontSize: 13,
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
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 10,
            }}
          >
            {g.members.map((m) => (
              <span
                key={m.id}
                style={{
                  background: t.tagBg,
                  border: `1px solid ${t.tagBorder}`,
                  color: t.tagColor,
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {m.username}
                <span
                  onClick={() =>
                    removeMember(g.id, m.id)
                  }
                  style={{
                    cursor: "pointer",
                    opacity: 0.6,
                    lineHeight: 1,
                  }}
                >
                  ✕
                </span>
              </span>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
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
                .filter((u) =>
                  !g.members.some((m) => m.id === u.id)
                )
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
            </select>
          </div>
        </div>
      ))}

      {showNewGroup && (
        <Modal
          title="Create group"
          onClose={() => setShowNewGroup(false)}
          t={t}
        >
          <Input
            label="Name"
            value={newGroup.name}
            onChange={(v) =>
              setNewGroup((g) => ({ ...g, name: v }))
            }
            t={t}
          />
          <Input
            label="Description (optional)"
            value={newGroup.description}
            onChange={(v) =>
              setNewGroup((g) => ({
                ...g,
                description: v,
              }))
            }
            t={t}
          />
          <button
            onClick={createGroup}
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

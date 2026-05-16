"use client";

import React, { useState } from "react";
import { AuthUser } from "@/types";
import { API } from "@/constants/themes";

interface LoginScreenProps {
  onLogin: (user: AuthUser, token: string) => void;
  onRegister: () => void;
}

export function LoginScreen({ onLogin, onRegister }: LoginScreenProps) {
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      onLogin(data.user, data.token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        fontFamily: "'Roboto Mono',monospace",
      }}
    >
      <div
        style={{
          background: "#161616",
          border: "1px solid #2a2a2a",
          borderRadius: 8,
          padding: "32px 36px",
          width: "min(360px, 92vw)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 4,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#e05a5a"
            strokeWidth="2.5"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span style={{ fontSize: 15, color: "#c8c8c8" }}>oServer</span>
          <span style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>
            sign in
          </span>
        </div>

        {(["username", "password"] as const).map((k) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                fontSize: 10,
                color: "#555",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {k}
            </label>
            <input
              style={{
                background: "#0e0e0e",
                border: "1px solid #2a2a2a",
                borderRadius: 4,
                padding: "9px 12px",
                color: "#c8c8c8",
                fontFamily: "inherit",
                fontSize: 13,
                outline: "none",
              }}
              type={k === "password" ? "password" : "text"}
              value={creds[k]}
              onChange={(e) => setCreds({ ...creds, [k]: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              autoFocus={k === "username"}
            />
          </div>
        ))}

        {error && <div style={{ fontSize: 12, color: "#e05a5a" }}>{error}</div>}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            background: "#1e1e1e",
            border: "1px solid #3a3a3a",
            borderRadius: 5,
            padding: "11px",
            color: "#c8c8c8",
            fontFamily: "inherit",
            fontSize: 13,
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}
        >
          {loading ? "Signing in…" : "Sign in →"}
        </button>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 11, color: "#555" }}>
            default: admin / admin
          </span>
          <button
            onClick={onRegister}
            style={{
              background: "none",
              border: "none",
              color: "#555",
              fontFamily: "inherit",
              fontSize: 11,
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#888")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
          >
            Register →
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { AuthUser } from "@/types";
import { API } from "@/constants/themes";

interface RegisterScreenProps {
  onRegister: (user: AuthUser, token: string) => void;
  onBackToLogin: () => void;
}

export function RegisterScreen({ onRegister, onBackToLogin }: RegisterScreenProps) {
  const [form, setForm] = useState({ username: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRegister() {
    setError("");
    if (form.username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.username, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      onRegister(data.user, data.token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "#0e0e0e",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    padding: "9px 12px",
    color: "#c8c8c8",
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: "#555",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };

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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e05a5a" strokeWidth="2.5">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span style={{ fontSize: 15, color: "#c8c8c8" }}>oServer</span>
          <span style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>create account</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStyle}>Username</label>
          <input
            style={inputStyle}
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && handleRegister()}
            autoFocus
            placeholder="min. 3 characters"
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStyle}>Password</label>
          <input
            style={inputStyle}
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && handleRegister()}
            placeholder="min. 6 characters"
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStyle}>Confirm password</label>
          <input
            style={inputStyle}
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && handleRegister()}
            placeholder="repeat password"
          />
        </div>

        {error && <div style={{ fontSize: 12, color: "#e05a5a" }}>{error}</div>}

        <button
          onClick={handleRegister}
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
          {loading ? "Creating account…" : "Create account →"}
        </button>

        <button
          onClick={onBackToLogin}
          style={{
            background: "none",
            border: "none",
            color: "#555",
            fontFamily: "inherit",
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
            textAlign: "center",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#888")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
        >
          ← Back to sign in
        </button>
      </div>
    </div>
  );
}

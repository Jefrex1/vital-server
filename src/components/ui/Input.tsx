"use client";

import React from "react";
import { THEMES } from "@/constants/themes";

interface InputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  t: typeof THEMES.dark;
}

export function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  t,
}: InputProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label
        style={{
          fontSize: 10,
          color: t.textDim,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: t.inputBg,
          border: `1px solid ${t.border2}`,
          borderRadius: 4,
          padding: "8px 12px",
          color: t.text,
          fontFamily: "inherit",
          fontSize: 13,
          outline: "none",
        }}
      />
    </div>
  );
}

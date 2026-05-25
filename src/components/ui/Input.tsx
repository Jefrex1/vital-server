"use client";

import React from "react";
import { THEMES } from "@/constants/themes";

interface InputProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  type?: string;
  placeholder?: string;
  t: typeof THEMES.dark;
}

export function Input({ label, value, onChange, onKeyDown, type = "text", placeholder = "", t }: InputProps) {
  const inputStyle: React.CSSProperties = {
    background: t.inputBg,
    border: `1px solid ${t.border2}`,
    borderRadius: 4,
    padding: "8px 12px",
    color: t.text,
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  const input = (
    <input
      type={type}
      value={value}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      style={inputStyle}
    />
  );

  if (!label) return input;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 10, color: t.textDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </label>
      {input}
    </div>
  );
}

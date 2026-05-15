"use client";

import React from "react";
import { THEMES } from "@/constants/themes";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  t: typeof THEMES.dark;
  width?: number;
}

export function Modal({
  title,
  onClose,
  children,
  t,
  width = 400,
}: ModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: t.modalBg,
          border: `1px solid ${t.modalBorder}`,
          borderRadius: 8,
          padding: "24px 28px",
          width: `min(${width}px, 94vw)`,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxHeight: "85vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: t.text,
              fontWeight: 500,
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: t.textDim,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

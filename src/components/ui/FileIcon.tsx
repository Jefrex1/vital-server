"use client";

import React from "react";
import { FileItem } from "@/types";
import { THEMES } from "@/constants/themes";
import { fileExtension, isVideoFile, isImageFile } from "@/utils/helpers";

interface FileIconProps {
  item: FileItem;
  size?: number;
  t: typeof THEMES.dark;
}

export function FileIcon({ item, size = 44, t }: FileIconProps) {
  const s = Math.round(size * 0.48);

  if (item.type === "dir") {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${t.dirIconBorder}`,
          background: t.dirIconBg,
        }}
      >
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          stroke={t.accent}
          strokeWidth="1.5"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
    );
  }

  if (isVideoFile(item.name)) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${t.border2}`,
          background: t.fileIconBg,
        }}
      >
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          stroke={t.yellow}
          strokeWidth="1.5"
        >
          <rect x="2" y="2" width="20" height="20" rx="2" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      </div>
    );
  }

  if (isImageFile(item.name)) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${t.border2}`,
          background: t.fileIconBg,
        }}
      >
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          stroke={t.green}
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
    );
  }

  const extColors: Record<string, string> = {
    js: "#f0db4f",
    ts: "#3178c6",
    tsx: "#3178c6",
    jsx: "#61dafb",
    json: "#f0db4f",
    py: "#4584b6",
    sh: "#4caf72",
    md: "#aaa",
    html: "#e34c26",
    css: "#264de4",
    rs: "#ce422b",
    go: "#00add8",
    java: "#b07219",
    log: "#888",
    zip: "#e0a040",
    rar: "#e0a040",
    jar: "#b07219",
  };

  const color = extColors[fileExtension(item.name)] || t.textDim;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1px solid ${t.border2}`,
        background: t.fileIconBg,
      }}
    >
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      >
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
    </div>
  );
}

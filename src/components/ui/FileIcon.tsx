"use client";

import React from "react";
import { FileItem } from "@/types";
import { THEMES } from "@/constants/themes";
import { fileExtension, isVideoFile, isImageFile, isAudioFile } from "@/utils/helpers";

interface FileIconProps {
  item: FileItem;
  size?: number;
  t: typeof THEMES.dark;
}

function IconWrap({ size, t, children, color }: { size: number; t: typeof THEMES.dark; children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 5,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: `1px solid ${color ? color + "44" : t.border2}`,
      background: color ? color + "12" : t.fileIconBg,
    }}>
      {children}
    </div>
  );
}

export function FileIcon({ item, size = 44, t }: FileIconProps) {
  const s = Math.round(size * 0.48);

  // Directory
  if (item.type === "dir") {
    return (
      <div style={{
        width: size, height: size, borderRadius: 5,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${t.dirIconBorder}`, background: t.dirIconBg,
      }}>
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
    );
  }

  // Video — кіноплівка
  if (isVideoFile(item.name)) {
    return (
      <IconWrap size={size} t={t} color="#e53935">
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#e53935" strokeWidth="1.5">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <polygon points="10,8 10,16 17,12" fill="#e53935" stroke="none" />
        </svg>
      </IconWrap>
    );
  }

  // Audio — нота
  if (isAudioFile(item.name)) {
    return (
      <IconWrap size={size} t={t} color="#ab47bc">
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#ab47bc" strokeWidth="1.5">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill="#ab47bc" fillOpacity="0.3" />
          <circle cx="18" cy="16" r="3" fill="#ab47bc" fillOpacity="0.3" />
        </svg>
      </IconWrap>
    );
  }

  // Image — гора + сонце
  if (isImageFile(item.name)) {
    return (
      <IconWrap size={size} t={t} color="#26a69a">
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#26a69a" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" fill="#26a69a" fillOpacity="0.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </IconWrap>
    );
  }

  // Extension-based colors + icons
  const ext = fileExtension(item.name);

  const extMap: Record<string, { color: string; icon: React.ReactNode }> = {
    js:   { color: "#f0db4f", icon: <text x="4" y="17" fontSize="11" fontWeight="bold" fill="#f0db4f" fontFamily="monospace">JS</text> },
    ts:   { color: "#3178c6", icon: <text x="4" y="17" fontSize="11" fontWeight="bold" fill="#3178c6" fontFamily="monospace">TS</text> },
    tsx:  { color: "#3178c6", icon: <text x="1" y="17" fontSize="10" fontWeight="bold" fill="#3178c6" fontFamily="monospace">TSX</text> },
    jsx:  { color: "#61dafb", icon: <text x="1" y="17" fontSize="10" fontWeight="bold" fill="#61dafb" fontFamily="monospace">JSX</text> },
    json: { color: "#f0db4f", icon: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#f0db4f" strokeWidth="1.5">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
        <path d="M9 13c0 1.1-.4 2-1 2s-1-.9-1-2 .4-2 1-2 1 .9 1 2z" fill="#f0db4f" stroke="none"/>
      </svg>
    )},
    py:   { color: "#4584b6", icon: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
        <path d="M12 2C8 2 7 4 7 6v2h5v1H5.5C3.5 9 2 10.5 2 13s1.5 4 3.5 4H7v-2.5c0-2 1-3 3-3h4c2 0 3-1 3-3V6c0-2-1-4-5-4z" fill="#4584b6" fillOpacity="0.8" stroke="none"/>
        <path d="M12 22c4 0 5-2 5-4v-2h-5v-1h6.5c2 0 3.5-1.5 3.5-4s-1.5-4-3.5-4H17v2.5c0 2-1 3-3 3H10c-2 0-3 1-3 3v2c0 2 1 4 5 4z" fill="#ffde57" fillOpacity="0.9" stroke="none"/>
        <circle cx="10" cy="5.5" r="1" fill="#fff"/>
        <circle cx="14" cy="18.5" r="1" fill="#fff"/>
      </svg>
    )},
    sh:   { color: "#4caf72", icon: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#4caf72" strokeWidth="1.5">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    )},
    md:   { color: "#90a4ae", icon: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#90a4ae" strokeWidth="1.5">
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
        <line x1="9" y1="9" x2="10" y2="9" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="15" y2="17" />
      </svg>
    )},
    html: { color: "#e34c26", icon: <text x="2" y="17" fontSize="9" fontWeight="bold" fill="#e34c26" fontFamily="monospace">HTML</text> },
    css:  { color: "#264de4", icon: <text x="2" y="17" fontSize="10" fontWeight="bold" fill="#264de4" fontFamily="monospace">CSS</text> },
    rs:   { color: "#ce422b", icon: <text x="4" y="17" fontSize="11" fontWeight="bold" fill="#ce422b" fontFamily="monospace">Rs</text> },
    go:   { color: "#00add8", icon: <text x="3" y="17" fontSize="11" fontWeight="bold" fill="#00add8" fontFamily="monospace">Go</text> },
    java: { color: "#b07219", icon: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#b07219" strokeWidth="1.5">
        <path d="M9 3s-1 5 3 7" /><path d="M11 3s1 5-3 7" />
        <path d="M7 13s-2 1-2 3c0 3 7 4 7 4s7-1 7-4c0-2-2-3-2-3" />
        <path d="M7 17s-1 1 0 2c2 2 8 2 10 0 1-1 0-2 0-2" />
      </svg>
    )},
    log:  { color: "#78909c", icon: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#78909c" strokeWidth="1.5">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" />
      </svg>
    )},
    zip:  { color: "#e0a040", icon: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#e0a040" strokeWidth="1.5">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
        <line x1="10" y1="5" x2="14" y2="5" />
        <line x1="10" y1="8" x2="14" y2="8" />
        <line x1="10" y1="11" x2="14" y2="11" />
        <rect x="9" y="13" width="6" height="5" rx="1" fill="#e0a040" fillOpacity="0.3" />
      </svg>
    )},
    rar:  { color: "#e0a040", icon: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#e0a040" strokeWidth="1.5">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
        <line x1="10" y1="5" x2="14" y2="5" />
        <line x1="10" y1="8" x2="14" y2="8" />
        <line x1="10" y1="11" x2="14" y2="11" />
        <rect x="9" y="13" width="6" height="5" rx="1" fill="#e0a040" fillOpacity="0.3" />
      </svg>
    )},
    jar:  { color: "#b07219", icon: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#b07219" strokeWidth="1.5">
        <path d="M8 3h8l1 4H7z" /><path d="M7 7c0 8 2 13 5 13s5-5 5-13" />
      </svg>
    )},
    pdf:  { color: "#f44336", icon: <text x="2" y="17" fontSize="10" fontWeight="bold" fill="#f44336" fontFamily="monospace">PDF</text> },
    sql:  { color: "#42a5f5", icon: <text x="2" y="17" fontSize="10" fontWeight="bold" fill="#42a5f5" fontFamily="monospace">SQL</text> },
    csv:  { color: "#66bb6a", icon: <text x="2" y="17" fontSize="10" fontWeight="bold" fill="#66bb6a" fontFamily="monospace">CSV</text> },
    xml:  { color: "#ff7043", icon: <text x="2" y="17" fontSize="10" fontWeight="bold" fill="#ff7043" fontFamily="monospace">XML</text> },
    yml:  { color: "#ef5350", icon: <text x="2" y="16" fontSize="9"  fontWeight="bold" fill="#ef5350" fontFamily="monospace">YAML</text> },
    yaml: { color: "#ef5350", icon: <text x="2" y="16" fontSize="9"  fontWeight="bold" fill="#ef5350" fontFamily="monospace">YAML</text> },
    toml: { color: "#ffa726", icon: <text x="1" y="17" fontSize="9"  fontWeight="bold" fill="#ffa726" fontFamily="monospace">TOML</text> },
    env:  { color: "#26c6da", icon: <text x="2" y="17" fontSize="10" fontWeight="bold" fill="#26c6da" fontFamily="monospace">ENV</text> },
  };

  const entry = extMap[ext];
  const color = entry?.color || t.textDim;

  // Text-badge icons (JS, TS, etc.) need an svg wrapper
  const isBadge = entry && !(entry.icon as any)?.props?.viewBox;

  return (
    <IconWrap size={size} t={t} color={color}>
      {entry ? (
        isBadge ? (
          <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24">
            {entry.icon}
          </svg>
        ) : (
          entry.icon
        )
      ) : (
        // Generic file
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <polyline points="13 2 13 9 20 9" />
        </svg>
      )}
    </IconWrap>
  );
}

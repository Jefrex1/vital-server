"use client";

import React, { useState, useEffect, useRef } from "react";
import { FileItem, SSHConfig } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { joinPath, isImageFile, isTextFile, isAudioFile, isVideoFile, formatSize } from "@/utils/helpers";
import { FileIcon } from "./ui/FileIcon";

interface RichPreviewProps {
  item: FileItem | null;
  config: SSHConfig;
  token: string;
  currentPath: string;
  t: typeof THEMES.dark;
}

export function RichPreview({ item, config, token, currentPath, t }: RichPreviewProps) {
  const [previewData, setPreviewData] = useState<
    | { kind: "text"; content: string }
    | { kind: "image"; url: string }
    | { kind: "media"; url: string; mediaType: "audio" | "video" }
    | { kind: "none" }
    | null
  >(null);
  const [loading, setLoading] = useState(false);
  const prevUrlRef = useRef<string | null>(null);

  const hdr = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  function buildBody(extra: object) {
    if (config.id) return JSON.stringify({ configId: config.id, ...extra });
    return JSON.stringify({
      host: config.host, username: config.username,
      password: config.password, port: config.port, ...extra,
    });
  }

  useEffect(() => {
    // Revoke previous blob URL to free memory
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }

    if (!item || item.type === "dir") {
      setPreviewData({ kind: "none" });
      return;
    }

    const filePath = joinPath(currentPath, item.name);

    if (isImageFile(item.name)) {
      setLoading(true);
      fetch(`${API}/files/download`, { method: "POST", headers: hdr, body: buildBody({ path: filePath }) })
        .then(r => r.blob())
        .then(b => {
          const url = URL.createObjectURL(b);
          prevUrlRef.current = url;
          setPreviewData({ kind: "image", url });
        })
        .catch(() => setPreviewData({ kind: "none" }))
        .finally(() => setLoading(false));

    } else if (isAudioFile(item.name)) {
      setLoading(true);
      fetch(`${API}/files/download`, { method: "POST", headers: hdr, body: buildBody({ path: filePath }) })
        .then(r => r.blob())
        .then(b => {
          const url = URL.createObjectURL(b);
          prevUrlRef.current = url;
          setPreviewData({ kind: "media", url, mediaType: "audio" });
        })
        .catch(() => setPreviewData({ kind: "none" }))
        .finally(() => setLoading(false));

    } else if (isVideoFile(item.name)) {
      setLoading(true);
      fetch(`${API}/files/download`, { method: "POST", headers: hdr, body: buildBody({ path: filePath }) })
        .then(r => r.blob())
        .then(b => {
          const url = URL.createObjectURL(b);
          prevUrlRef.current = url;
          setPreviewData({ kind: "media", url, mediaType: "video" });
        })
        .catch(() => setPreviewData({ kind: "none" }))
        .finally(() => setLoading(false));

    } else if (isTextFile(item.name) && item.size < 500_000) {
      setLoading(true);
      fetch(`${API}/files/read`, { method: "POST", headers: hdr, body: buildBody({ path: filePath }) })
        .then(r => r.json())
        .then(d => setPreviewData({ kind: "text", content: d.content || "" }))
        .catch(() => setPreviewData({ kind: "none" }))
        .finally(() => setLoading(false));

    } else {
      setPreviewData({ kind: "none" });
    }
  }, [item?.name, currentPath]); // eslint-disable-line

  // Warn for large video files before loading
  const isLargeFile = (item?.size ?? 0) > 200 * 1024 * 1024; // 200MB
  const [largeDismissed, setLargeDismissed] = useState(false);

  useEffect(() => { setLargeDismissed(false); }, [item?.name]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Preview area */}
      <div style={{
        flex: 1, background: t.previewBg, display: "flex", alignItems: "center",
        justifyContent: "center", overflow: "hidden", position: "relative", minHeight: 0,
      }}>
        {loading && (
          <div style={{ fontSize: 11, color: t.textDim }}>Loading…</div>
        )}

        {/* Image */}
        {!loading && previewData?.kind === "image" && (
          <img
            src={(previewData as any).url}
            alt={item?.name}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        )}

        {/* Audio player */}
        {!loading && previewData?.kind === "media" && (previewData as any).mediaType === "audio" && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 14, padding: "20px 16px", width: "100%",
          }}>
            {/* Music icon */}
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <div style={{ fontSize: 11, color: t.textDim, textAlign: "center", wordBreak: "break-all", padding: "0 8px" }}>
              {item?.name}
            </div>
            <audio
              controls
              autoPlay={false}
              src={(previewData as any).url}
              style={{ width: "100%", maxWidth: 220, accentColor: t.accent }}
            />
          </div>
        )}

        {/* Video player */}
        {!loading && previewData?.kind === "media" && (previewData as any).mediaType === "video" && (
          <video
            controls
            autoPlay={false}
            src={(previewData as any).url}
            style={{
              maxWidth: "100%", maxHeight: "100%",
              objectFit: "contain", background: "#000",
              borderRadius: 4,
            }}
          />
        )}

        {/* Large file warning (video/audio before load) */}
        {!loading && previewData?.kind === "none" && item &&
          (isVideoFile(item.name) || isAudioFile(item.name)) &&
          isLargeFile && !largeDismissed && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 10, padding: 20, textAlign: "center",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={t.yellow} strokeWidth="1.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div style={{ fontSize: 11, color: t.textDim }}>File is large ({formatSize(item.size)}). Load anyway?</div>
            <button
              onClick={() => { setLargeDismissed(true); }}
              style={{ background: t.accent, border: "none", borderRadius: 4, padding: "6px 16px", fontSize: 11, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
            >
              Load
            </button>
          </div>
        )}

        {/* Text preview */}
        {!loading && previewData?.kind === "text" && (
          <div style={{ position: "absolute", inset: 0, overflow: "auto", padding: 10, background: t.previewTextBg }}>
            <pre style={{
              fontSize: 10, lineHeight: 1.5, color: t.previewTextColor,
              fontFamily: "'Roboto Mono', monospace", margin: 0,
              whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>
              {(previewData as any).content.slice(0, 4000)}
            </pre>
          </div>
        )}

        {/* Generic icon fallback */}
        {!loading && (!previewData || previewData.kind === "none") && item &&
          !isLargeFile && (
          <FileIcon item={item} size={52} t={t} />
        )}
        {!loading && !item && (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={t.border2} strokeWidth="1">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )}
      </div>

      {/* File info */}
      {item && (
        <div style={{ padding: 14, borderTop: `1px solid ${t.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: t.text, marginBottom: 10, wordBreak: "break-all", lineHeight: 1.4 }}>
            {item.name}
          </div>
          {[
            ["type", item.type],
            ["size", formatSize(item.size)],
            ["modified", item.modified ? new Date(item.modified).toLocaleDateString("uk-UA") : "—"],
            ["perms", item.permissions || "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
              <span style={{ color: t.textDim }}>{k}</span>
              <span style={{ color: t.textMid }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

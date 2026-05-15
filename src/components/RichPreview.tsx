"use client";

import React, { useState, useEffect } from "react";
import { FileItem, SSHConfig } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { joinPath, isImageFile, isTextFile, formatSize } from "@/utils/helpers";
import { FileIcon } from "./ui/FileIcon";

interface RichPreviewProps {
  item: FileItem | null;
  config: SSHConfig;
  token: string;
  currentPath: string;
  t: typeof THEMES.dark;
}

export function RichPreview({
  item,
  config,
  token,
  currentPath,
  t,
}: RichPreviewProps) {
  const [previewData, setPreviewData] = useState<
    { kind: "text"; content: string } |
    { kind: "image"; url: string } |
    { kind: "none" } |
    null
  >(null);
  const [loading, setLoading] = useState(false);
  const hdr = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  function buildBody(extra: object) {
    if (config.id)
      return JSON.stringify({ configId: config.id, ...extra });
    return JSON.stringify({
      host: config.host,
      username: config.username,
      password: config.password,
      port: config.port,
      ...extra,
    });
  }

  useEffect(() => {
    if (!item || item.type === "dir") {
      setPreviewData({ kind: "none" });
      return;
    }

    const filePath = joinPath(currentPath, item.name);

    if (isImageFile(item.name)) {
      setLoading(true);
      fetch(`${API}/files/download`, {
        method: "POST",
        headers: hdr,
        body: buildBody({ path: filePath }),
      })
        .then((r) => r.blob())
        .then((b) =>
          setPreviewData({ kind: "image", url: URL.createObjectURL(b) })
        )
        .catch(() => setPreviewData({ kind: "none" }))
        .finally(() => setLoading(false));
    } else if (isTextFile(item.name) && item.size < 500_000) {
      setLoading(true);
      fetch(`${API}/files/read`, {
        method: "POST",
        headers: hdr,
        body: buildBody({ path: filePath }),
      })
        .then((r) => r.json())
        .then((d) =>
          setPreviewData({ kind: "text", content: d.content || "" })
        )
        .catch(() => setPreviewData({ kind: "none" }))
        .finally(() => setLoading(false));
    } else {
      setPreviewData({ kind: "none" });
    }
  }, [item?.name, currentPath]); // eslint-disable-line

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          background: t.previewBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
          minHeight: 0,
        }}
      >
        {loading && (
          <div style={{ fontSize: 11, color: t.textDim }}>
            Loading…
          </div>
        )}
        {!loading && previewData?.kind === "image" && (
          <img
            src={(previewData as any).url}
            alt={item?.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
          />
        )}
        {!loading && previewData?.kind === "text" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "auto",
              padding: 10,
              background: t.previewTextBg,
            }}
          >
            <pre
              style={{
                fontSize: 10,
                lineHeight: 1.5,
                color: t.previewTextColor,
                fontFamily: "'Roboto Mono', monospace",
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {(previewData as any).content.slice(0, 4000)}
            </pre>
          </div>
        )}
        {!loading &&
          (!previewData || previewData.kind === "none") &&
          item && (
            <FileIcon item={item} size={52} t={t} />
          )}
        {!loading && !item && (
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke={t.border2}
            strokeWidth="1"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )}
      </div>
      {item && (
        <div
          style={{
            padding: 14,
            borderTop: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: t.text,
              marginBottom: 10,
              wordBreak: "break-all",
              lineHeight: 1.4,
            }}
          >
            {item.name}
          </div>
          {[
            ["type", item.type],
            ["size", formatSize(item.size)],
            [
              "modified",
              item.modified
                ? new Date(item.modified).toLocaleDateString(
                    "uk-UA"
                  )
                : "—",
            ],
            ["perms", item.permissions || "—"],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                marginBottom: 5,
              }}
            >
              <span style={{ color: t.textDim }}>{k}</span>
              <span style={{ color: t.textMid }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

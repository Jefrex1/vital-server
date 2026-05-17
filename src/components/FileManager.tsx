"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { AuthUser, SSHConfig, FileItem, Metrics, SidebarDir } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { useWindowWidth } from "@/hooks/useWindowWidth";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  joinPath,
  isTextFile,
  formatSize,
} from "@/utils/helpers";
import { Sparkline } from "./ui/Sparkline";
import { FileIcon } from "./ui/FileIcon";
import { Terminal } from "./Terminal";
import { RichPreview } from "./RichPreview";

interface FileManagerProps {
  authUser: AuthUser;
  token: string;
  config: SSHConfig;
  theme: "dark" | "light";
  onThemeChange: (theme: "dark" | "light") => void;
  onAdminClick: () => void;
  onGroupsClick: () => void;
  onAccountClick: () => void;
  onLogout: () => void;
  onDisconnect: () => void;
}

export function FileManager({
  authUser,
  token,
  config,
  theme,
  onThemeChange,
  onAdminClick,
  onGroupsClick,
  onAccountClick,
  onLogout,
  onDisconnect,
}: FileManagerProps) {
  const t = THEMES[theme];
  const winW = useWindowWidth();
  const isMobile = winW < 600;
  const isNarrow = winW < 900;
  const isWide = winW >= 1280;

  // File manager state
  const [homeDir, setHomeDir] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(
    new Set()
  );
  const lastClickedRef = useRef<string | null>(null);
  const [primarySelected, setPrimarySelected] =
    useState<FileItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"files" | "editor" | "terminal">(
    "files"
  );
  const [editorContent, setEditorContent] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [sidebarDirs, setSidebarDirs] = useState<SidebarDir[]>([]);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(
    new Set()
  );
  const [sidebarOpen, setSidebarOpen] = useState(!isNarrow);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [cpuH, setCpuH] = useState<number[]>([0]);
  const [gpuH, setGpuH] = useState<number[]>([0]);
  const [memH, setMemH] = useState<number[]>([0]);
  const [notification, setNotification] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [wsStatus, setWsStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");

  const gridRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  const { send: wsSend, wsRef } = useWebSocket(
    useCallback((msg: any) => {
      if (msg.type === "metrics:data") {
        const m: Metrics = msg;
        setMetrics(m);
        setCpuH((h) => [...h.slice(-14), m.cpuTemp]);
        setGpuH((h) => [...h.slice(-14), m.gpuTemp]);
        setMemH((h) => [
          ...h.slice(-14),
          Math.round(((m.memUsed / (m.memTotal || 1)) * 100)),
        ]);
      }
    }, [])
  );

  useEffect(() => {
    setSidebarOpen(!isNarrow);
  }, [isNarrow]);

  const authHeaders = useCallback(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const api = useCallback(
    async (endpoint: string, body: object) => {
      const cfgBody = config?.id
        ? { configId: config.id }
        : {
            host: config?.host,
            username: config?.username,
            password: config?.password,
            port: config?.port,
            ssh_key: config?.ssh_key,
            auth_type: config?.auth_type,
          };

      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...cfgBody, ...body }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    },
    [config, authHeaders]
  );

  function notify(msg: string) {
    setNotification(msg);
    setTimeout(() => setNotification(""), 2500);
  }

  const loadDir = useCallback(
    async (path: string) => {
      setLoading(true);
      setSelectedNames(new Set());
      setPrimarySelected(null);
      setView("files");
      setSearchQ("");

      try {
        const data = await api("/files/list", { path });
        setFiles(data.items || []);
        setAllFiles(data.items || []);
        setCurrentPath(data.path);
      } catch (e: any) {
        notify("Error: " + e.message);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const loadTree = useCallback(
    async (homePath?: string) => {
      if (!config) return;

      try {
        const home =
          homePath ??
          homeDir ??
          `/home/${config.username}`;
        const data = await api("/files/tree", {
          path: home,
          depth: 3,
        });

        const dirs: SidebarDir[] = [];
        (data.dirs as string[]).forEach((d) => {
          const rel = d.startsWith(home)
            ? d.slice(home.length)
            : d;
          const parts = rel.split("/").filter(Boolean);
          dirs.push({
            path: d,
            depth: parts.length,
            label:
              parts[parts.length - 1] ||
              config.username,
          });
        });

        setSidebarDirs(dirs);
      } catch {}
    },
    [api, config, homeDir]
  );

  useEffect(() => {
    if (!config || !token) return;

    async function initHome() {
      // Якщо конфіг групи має прив'язану папку — одразу відкриваємо її
      if (config!.provision_root_path) {
        const home = config!.provision_root_path;
        setHomeDir(home);
        setCurrentPath(home);
        loadDir(home);
        loadTree(home);
        return;
      }

      let home = `/home/${config!.username}`;

      try {
        const cfgBody = config!.id
          ? { configId: config!.id }
          : {
              host: config!.host,
              username: config!.username,
              password: config!.password,
              port: config!.port,
            };
        const d = await fetch(`${API}/run`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            ...cfgBody,
            command: "echo ~",
          }),
        }).then((r) => r.json());

        const detected = d.stdout?.trim();
        if (detected?.startsWith("/")) home = detected;
      } catch {}

      setHomeDir(home);
      setCurrentPath(home);
      loadDir(home);
      loadTree(home);
    }

    initHome();

    const ws = wsRef.current!;

    function startMetrics() {
      setWsStatus("connected");
      wsSend({ type: "auth", token });

      setTimeout(() => {
        const payload: any = {
          type: "metrics:start",
        };
        if (config!.id) payload.configId = config!.id;
        else
          Object.assign(payload, {
            host: config!.host,
            username: config!.username,
            password: config!.password,
            port: config!.port,
          });
        wsSend(payload);
      }, 300);
    }

    if (ws.readyState === WebSocket.OPEN) {
      startMetrics();
    } else {
      ws.addEventListener("open", startMetrics, {
        once: true,
      });
    }

    ws.addEventListener("close", () =>
      setWsStatus("disconnected")
    );

    return () => {
      wsSend({ type: "metrics:stop" });
    };
  }, [config, token]); // eslint-disable-line

  useEffect(() => {
    if (!searchQ) {
      setFiles(allFiles);
      return;
    }

    setFiles(
      allFiles.filter((f) =>
        f.name
          .toLowerCase()
          .includes(searchQ.toLowerCase())
      )
    );
  }, [searchQ, allFiles]);

  function navigate(path: string) {
    loadDir(path);
    if (isMobile) setSidebarOpen(false);
  }

  function navigateUp() {
    const parts = currentPath.split("/").filter(Boolean);
    if (parts.length <= 1) return;
    parts.pop();
    navigate("/" + parts.join("/"));
  }

  function handleFileClick(
    item: FileItem,
    e: React.MouseEvent
  ) {
    const name = item.name;

    if (e.shiftKey && lastClickedRef.current) {
      const idx1 = files.findIndex(
        (f) => f.name === lastClickedRef.current
      );
      const idx2 = files.findIndex((f) => f.name === name);

      if (idx1 !== -1 && idx2 !== -1) {
        const [lo, hi] = [
          Math.min(idx1, idx2),
          Math.max(idx1, idx2),
        ];
        const range = files
          .slice(lo, hi + 1)
          .map((f) => f.name);
        setSelectedNames((prev) => {
          const next = new Set(prev);
          range.forEach((n) => next.add(n));
          return next;
        });
        setPrimarySelected(item);
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      setSelectedNames((prev) => {
        const next = new Set(prev);
        next.has(name)
          ? next.delete(name)
          : next.add(name);
        return next;
      });
      setPrimarySelected(item);
      lastClickedRef.current = name;
      return;
    }

    setSelectedNames(new Set([name]));
    setPrimarySelected(item);
    lastClickedRef.current = name;
  }

  function handleFileDoubleClick(item: FileItem) {
    if (item.type === "dir") {
      navigate(joinPath(currentPath, item.name));
      return;
    }

    if (isTextFile(item.name)) {
      openTextFile(item);
    }
  }

  async function openTextFile(item: FileItem) {
    setLoading(true);

    try {
      const data = await api("/files/read", {
        path: joinPath(currentPath, item.name),
      });
      setEditorContent(data.content || "");
      setEditorDirty(false);
      setView("editor");
      setPrimarySelected(item);
    } catch (e: any) {
      notify("Cannot read: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function onGridMouseDown(
    e: React.MouseEvent<HTMLDivElement>
  ) {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest("[data-fcell]")) return;

    const grid = gridRef.current;
    if (!grid) return;

    const rect = grid.getBoundingClientRect();
    dragStartRef.current = {
      x: e.clientX - rect.left + grid.scrollLeft,
      y: e.clientY - rect.top + grid.scrollTop,
    };
    isDraggingRef.current = false;

    if (bandRef.current)
      Object.assign(bandRef.current.style, {
        display: "none",
        left: "0px",
        top: "0px",
        width: "0px",
        height: "0px",
      });

    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      setSelectedNames(new Set());
      setPrimarySelected(null);
    }

    const onMouseMove = (me: MouseEvent) => {
      if (!dragStartRef.current || !grid || !bandRef.current)
        return;

      const r = grid.getBoundingClientRect();
      const curX = me.clientX - r.left + grid.scrollLeft;
      const curY = me.clientY - r.top + grid.scrollTop;
      const sx = dragStartRef.current.x;
      const sy = dragStartRef.current.y;
      const bx = Math.min(sx, curX);
      const by = Math.min(sy, curY);
      const bw = Math.abs(curX - sx);
      const bh = Math.abs(curY - sy);

      if (bw > 5 || bh > 5) {
        isDraggingRef.current = true;
        Object.assign(bandRef.current.style, {
          display: "block",
          left: bx + "px",
          top: by + "px",
          width: bw + "px",
          height: bh + "px",
        });

        const cells = grid.querySelectorAll<HTMLElement>(
          "[data-fcell]"
        );
        const newSel = new Set<string>();

        cells.forEach((cell) => {
          const cr = cell.getBoundingClientRect();
          const cx =
            cr.left - r.left + grid.scrollLeft;
          const cy =
            cr.top - r.top + grid.scrollTop;

          if (
            cx + cr.width > bx &&
            cx < bx + bw &&
            cy + cr.height > by &&
            cy < by + bh
          ) {
            const n = cell.getAttribute("data-fcell");
            if (n) newSel.add(n);
          }
        });

        setSelectedNames(newSel);
        if (newSel.size > 0)
          setPrimarySelected(
            files.find((f) => newSel.has(f.name)) ||
              null
          );
      }
    };

    const onMouseUp = () => {
      if (bandRef.current)
        bandRef.current.style.display = "none";
      dragStartRef.current = null;
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  async function saveFile() {
    if (!primarySelected) return;

    try {
      await api("/files/write", {
        path: joinPath(currentPath, primarySelected.name),
        content: editorContent,
      });
      setEditorDirty(false);
      notify("Saved ✓");
    } catch (e: any) {
      notify("Save failed: " + e.message);
    }
  }

  async function deleteSelected() {
    const toDelete = [...selectedNames];
    if (toDelete.length === 0) return;
    if (!confirm(`Delete ${toDelete.length} item(s)?`))
      return;

    try {
      for (const name of toDelete)
        await api("/files/delete", {
          path: joinPath(currentPath, name),
        });

      notify("Deleted");
      setSelectedNames(new Set());
      setPrimarySelected(null);
      loadDir(currentPath);
    } catch (e: any) {
      notify("Error: " + e.message);
    }
  }

  function uploadFile() {
    const inp = document.createElement("input");
    inp.type = "file";

    inp.onchange = async () => {
      if (!inp.files?.[0]) return;

      const fd = new FormData();
      fd.append("file", inp.files[0]);

      if (config?.id) {
        fd.append("configId", String(config.id));
      } else {
        fd.append("host", config!.host);
        fd.append("username", config!.username);
        fd.append(
          "password",
          config!.password || ""
        );
        fd.append("port", String(config!.port));
      }

      fd.append("path", currentPath);

      try {
        const res = await fetch(`${API}/files/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: fd,
        });

        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error);
        }

        notify("Uploaded ✓");
        loadDir(currentPath);
      } catch (e: any) {
        notify("Upload failed: " + e.message);
      }
    };

    inp.click();
  }

  const home = homeDir || (config ? `/home/${config.username}` : "");

  function toggleCollapse(
    path: string,
    e: React.MouseEvent
  ) {
    e.stopPropagation();
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      next.has(path)
        ? next.delete(path)
        : next.add(path);
      return next;
    });
  }

  function renderSidebar() {
    const shown = new Set<string>();
    const items: SidebarDir[] = [];

    if (home) {
      items.push({
        path: home,
        depth: 0,
        label: config!.username,
      });
      shown.add(home);
    }

    sidebarDirs.forEach((d) => {
      if (!shown.has(d.path)) {
        shown.add(d.path);
        items.push(d);
      }
    });

    const result: JSX.Element[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let hidden = false;

      for (const collapsed of collapsedPaths) {
        if (
          item.path !== collapsed &&
          item.path.startsWith(collapsed + "/")
        ) {
          hidden = true;
          break;
        }
      }

      if (hidden) continue;

      const hasChildren = items.some(
        (o) =>
          o.path !== item.path &&
          o.path.startsWith(item.path + "/") &&
          o.depth === item.depth + 1
      );
      const isCollapsed = collapsedPaths.has(item.path);
      const isActive = currentPath === item.path;

      result.push(
        <div
          key={item.path}
          style={{
            padding: `5px 10px 5px ${
              10 + item.depth * 14
            }px`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: isWide ? 13 : 12,
            userSelect: "none",
            background: isActive ? t.sidebarActiveBg : undefined,
            color: isActive
              ? t.sidebarActiveColor
              : t.textDim,
            borderLeft: isActive
              ? `2px solid ${t.sidebarActiveBorder}`
              : "2px solid transparent",
            transition: "all 0.1s",
          }}
          onClick={() => navigate(item.path)}
        >
          {hasChildren ? (
            <span
              onClick={(e) =>
                toggleCollapse(item.path, e)
              }
              style={{
                width: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: t.textDim,
                transition: "transform 0.15s",
                transform: isCollapsed
                  ? "rotate(-90deg)"
                  : "rotate(0deg)",
              }}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="2,3 5,7 8,3" />
              </svg>
            </span>
          ) : (
            <span style={{ width: 14, flexShrink: 0 }} />
          )}

          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={
              isActive
                ? t.sidebarActiveColor
                : t.border2
            }
            strokeWidth="2"
            style={{ flexShrink: 0 }}
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>

          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </span>
        </div>
      );
    }

    return result;
  }

  const showPreview =
    !isMobile && !isNarrow && view === "files";
  const previewW = isWide ? 230 : 200;
  const cellMin = isMobile ? 70 : isNarrow ? 78 : isWide ? 90 : 82;
  const iconSize = isMobile ? 42 : isNarrow ? 48 : isWide ? 58 : 52;
  const fontSize = isMobile ? 10 : 11;
  const sidebarW = isMobile
    ? Math.min(260, winW * 0.75)
    : isNarrow
      ? 180
      : isWide
        ? 220
        : 200;

  const themeStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #__next { height: 100%; }
    body { background: ${t.bg}; font-family: 'Roboto Mono', monospace; -webkit-font-smoothing: antialiased; overflow: hidden; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${t.scrollbar}; border-radius: 4px; }
    input, button, textarea, select { font-family: 'Roboto Mono', monospace; }
    .fcell { border: 1px solid transparent; border-radius: 6px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; transition: background 0.1s, border-color 0.1s; user-select: none; padding: 7px 4px 6px; }
    .fcell:hover { background: ${t.hoverBg}; border-color: ${t.hoverBorder}; }
    .fcell.sel { background: ${t.selBg}; border-color: ${t.selBorder}; }
    .fcell.sel .fn { color: ${t.selText} !important; }
    .sb-item:hover { background: ${t.hoverBg} !important; color: ${t.text} !important; }
    .abtn { transition: border-color 0.1s, color 0.1s; }
    .abtn:hover:not(:disabled) { border-color: ${t.border2} !important; color: ${t.text} !important; }
    .abtn.danger:hover:not(:disabled) { border-color: ${t.red} !important; color: ${t.red} !important; }
    .topbtn:hover { color: ${t.text} !important; border-color: ${t.border2} !important; }
    .ws-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .band-select { position: absolute; pointer-events: none; border: 1px solid ${t.accent}; background: ${t.accentBg}; opacity: 0.5; z-index: 10; display: none; }
  `;

  return (
    <>
      <style>{themeStyles}</style>
      <div
        style={{
          background: t.bg,
          color: t.text,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          fontSize: isWide ? 14 : 13,
          overflow: "hidden",
        }}
      >
        {/* Topbar */}
        <div
          style={{
            background: t.topbarBg,
            borderBottom: `1px solid ${t.border}`,
            padding: `${isMobile ? 7 : 9}px 14px`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
            minHeight: isMobile ? 44 : 50,
          }}
        >
          {isNarrow && (
            <button
              onClick={() =>
                setSidebarOpen((o) => !o)
              }
              style={{
                background: "transparent",
                border: "none",
                color: t.textMid,
                cursor: "pointer",
                padding: "2px 4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}

          {/* Connection badge */}
          <div
            onClick={onDisconnect}
            style={{
              background: t.bg4,
              border: `1px solid ${t.border2}`,
              borderRadius: 4,
              padding: "5px 12px",
              fontSize: isMobile ? 11 : 13,
              display: "flex",
              alignItems: "center",
              gap: 7,
              color: t.text,
              cursor: "pointer",
              whiteSpace: "nowrap",
              maxWidth: isMobile ? 180 : 280,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title="Click to disconnect"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke={t.red}
              strokeWidth="2.5"
            >
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            {config.label
              ? config.label
              : `${config.username}@${config.host}`}
          </div>

          {/* WS status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: t.textDim,
            }}
          >
            <div
              className="ws-dot"
              style={{
                background:
                  wsStatus === "connected"
                    ? t.wsConnected
                    : wsStatus === "disconnected"
                      ? t.wsDisc
                      : t.textMid,
              }}
            />
            {!isMobile && <span>{wsStatus}</span>}
          </div>

          {!isMobile && (
            <input
              value={searchQ}
              onChange={(e) =>
                setSearchQ(e.target.value)
              }
              placeholder="Search files..."
              style={{
                flex: 1,
                background: t.bg4,
                border: `1px solid ${t.border2}`,
                borderRadius: 4,
                padding: "5px 12px",
                color: t.text,
                fontSize: 13,
                outline: "none",
              }}
            />
          )}

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            {/* Theme */}
            <button
              onClick={() => {
                const next: "dark" | "light" =
                  theme === "dark" ? "light" : "dark";
                onThemeChange(next);
              }}
              style={{
                background: t.bg4,
                border: `1px solid ${t.border2}`,
                borderRadius: 4,
                padding: "5px 9px",
                color: t.textMid,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              {theme === "dark" ? (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line
                    x1="18.36"
                    y1="18.36"
                    x2="19.78"
                    y2="19.78"
                  />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line
                    x1="4.22"
                    y1="19.78"
                    x2="5.64"
                    y2="18.36"
                  />
                  <line
                    x1="18.36"
                    y1="5.64"
                    x2="19.78"
                    y2="4.22"
                  />
                </svg>
              ) : (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Admin */}
            {authUser.role === "admin" && (
              <button
                className="topbtn"
                onClick={onAdminClick}
                style={{
                  background: t.bg4,
                  border: `1px solid ${t.border2}`,
                  borderRadius: 4,
                  padding: "5px 11px",
                  fontSize: isMobile ? 11 : 12,
                  color: t.textMid,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                {!isMobile && "Admin"}
              </button>
            )}

            {/* Groups */}
            <button
              className="topbtn"
              onClick={onGroupsClick}
              style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "5px 11px", fontSize: isMobile ? 11 : 12, color: t.textMid, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
            >
              👥{!isMobile && " Групи"}
            </button>

            {/* Account */}
            <button
              className="topbtn"
              onClick={onAccountClick}
              style={{ background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "5px 11px", fontSize: isMobile ? 11 : 12, color: t.textMid, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
            >
              ⚙{!isMobile && " Акаунт"}
            </button>

            {/* Terminal */}
            <button
              className="topbtn"
              onClick={() =>
                setView((v) =>
                  v === "terminal" ? "files" : "terminal"
                )
              }
              style={{
                background: t.bg4,
                border: `1px solid ${t.border2}`,
                borderRadius: 4,
                padding: "5px 11px",
                fontSize: isMobile ? 11 : 12,
                color:
                  view === "terminal"
                    ? t.accent
                    : t.textMid,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              {!isMobile && "Terminal"}
            </button>

            {/* User / logout */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: t.bg4,
                border: `1px solid ${t.border2}`,
                borderRadius: 4,
                padding: "5px 10px",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: t.textMid,
                }}
              >
                {authUser.username}
              </span>
              {authUser.role === "admin" && (
                <span
                  style={{
                    fontSize: 10,
                    color: t.yellow,
                    border: `1px solid ${t.yellow}`,
                    borderRadius: 3,
                    padding: "1px 5px",
                  }}
                >
                  admin
                </span>
              )}
              <button
                onClick={onLogout}
                title="Sign out"
                style={{
                  background: "none",
                  border: "none",
                  color: t.textDim,
                  cursor: "pointer",
                  fontSize: 13,
                  padding: "0 2px",
                  lineHeight: 1,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = t.red)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = t.textDim)
                }
              >
                ⏻
              </button>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div
          style={{
            background: t.metricPanel,
            borderBottom: `1px solid ${t.border}`,
            padding: `${isMobile ? 6 : 8}px 14px`,
            display: "flex",
            gap: 12,
            alignItems: "stretch",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {[
            {
              label: "CPU",
              val: metrics
                ? `${metrics.cpuTemp}°`
                : "—",
              hist: cpuH,
              color: t.sparkCpu,
            },
            {
              label: "GPU",
              val: metrics
                ? `${metrics.gpuTemp}°`
                : "—",
              hist: gpuH,
              color: t.sparkCpu,
            },
            {
              label: "Memory",
              val: metrics
                ? `${(
                    metrics.memUsed /
                    1024
                  ).toFixed(2)}gb / ${(
                    metrics.memTotal /
                    1024
                  ).toFixed(2)}gb`
                : "—",
              hist: memH,
              color: t.sparkMem,
            },
          ].map(({ label, val, hist, color }) => (
            <div
              key={label}
              style={{
                border: `1px solid ${t.cardBorder}`,
                borderRadius: 4,
                padding: isMobile
                  ? "5px 10px"
                  : "6px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: t.textDim,
                  letterSpacing: "0.05em",
                  marginBottom: 3,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: isMobile ? 12 : 14,
                  color: t.text,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>{val}</span>
                <Sparkline
                  data={hist}
                  color={color}
                  width={isMobile ? 45 : 60}
                  height={20}
                />
              </div>
            </div>
          ))}

          {!isMobile &&
            metrics &&
            metrics.disks.length > 0 && (
              <div
                style={{
                  border: `1px solid ${t.cardBorder}`,
                  borderRadius: 4,
                  padding: "6px 14px",
                  fontSize: 11,
                }}
              >
                <div
                  style={{
                    color: t.textDim,
                    marginBottom: 3,
                    fontSize: 10,
                    letterSpacing: "0.05em",
                  }}
                >
                  Storage:
                </div>
                {metrics.disks.slice(0, 3).map((d, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      color: t.textDim,
                    }}
                  >
                    <span>disc {i + 1}:</span>
                    <span style={{ color: t.textMid }}>
                      {d.used}/{d.size}
                    </span>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Main layout */}
        <div
          style={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            minHeight: 0,
            position: "relative",
          }}
        >
          {sidebarOpen && isMobile && (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.65)",
                zIndex: 15,
              }}
            />
          )}

          {sidebarOpen && (
            <div
              style={{
                width: sidebarW,
                background: t.bg2,
                borderRight: `1px solid ${t.border}`,
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                overflowY: "auto",
                position: isMobile
                  ? "absolute"
                  : "relative",
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: isMobile ? 20 : 1,
                height: "100%",
              }}
            >
              <div
                className="sb-item"
                onClick={() => navigate(home)}
                style={{
                  padding: "7px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: isWide ? 13 : 12,
                  color: t.textMid,
                  borderLeft: "2px solid transparent",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={t.textMid}
                  strokeWidth="2"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                Home
              </div>
              {renderSidebar()}
            </div>
          )}

          {/* Center */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            {/* Breadcrumbs */}
            <div
              style={{
                background: t.bg2,
                borderBottom: `1px solid ${t.border}`,
                padding: `6px 14px`,
                fontSize: isMobile ? 11 : 13,
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 0,
                flexShrink: 0,
                minHeight: 34,
              }}
            >
              {currentPath
                .split("/")
                .filter(Boolean)
                .map((part, i, arr) => {
                  const path =
                    "/" + arr.slice(0, i + 1).join("/");
                  return (
                    <span
                      key={path}
                      style={{
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {i > 0 && (
                        <span
                          style={{
                            color: t.border2,
                            margin: "0 3px",
                          }}
                        >
                          /
                        </span>
                      )}
                      <span
                        onClick={() => navigate(path)}
                        style={{
                          color: t.accent,
                          cursor: "pointer",
                          padding: "0 2px",
                        }}
                      >
                        {part}
                      </span>
                    </span>
                  );
                })}
            </div>

            {isMobile && (
              <div
                style={{
                  background: t.bg2,
                  borderBottom: `1px solid ${t.border}`,
                  padding: "5px 10px",
                }}
              >
                <input
                  value={searchQ}
                  onChange={(e) =>
                    setSearchQ(e.target.value)
                  }
                  placeholder="Search..."
                  style={{
                    width: "100%",
                    background: t.bg4,
                    border: `1px solid ${t.border2}`,
                    borderRadius: 4,
                    padding: "5px 10px",
                    color: t.text,
                    fontSize: 12,
                    outline: "none",
                  }}
                />
              </div>
            )}

            {/* Action bar */}
            <div
              style={{
                background: t.bg2,
                borderBottom: `1px solid ${t.border}`,
                padding: "6px 12px",
                display: "flex",
                gap: 5,
                flexShrink: 0,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {[
                {
                  label: "Up",
                  onClick: navigateUp,
                  disabled: false,
                },
                {
                  label: "Download",
                  onClick: async () => {
                    if (selectedNames.size === 0) return;
                    const name =
                      primarySelected?.name ||
                      [...selectedNames][0];
                    const item = files.find(
                      (f) => f.name === name
                    );
                    if (!item || item.type === "dir")
                      return;

                    try {
                      const cfgBody = config?.id
                        ? { configId: config.id }
                        : {
                            host: config!.host,
                            username:
                              config!.username,
                            password:
                              config!.password,
                            port: config!.port,
                          };

                      const res =
                        await fetch(
                          `${API}/files/download`,
                          {
                            method: "POST",
                            headers:
                              authHeaders(),
                            body: JSON.stringify({
                              ...cfgBody,
                              path: joinPath(
                                currentPath,
                                name
                              ),
                            }),
                          }
                        );

                      if (!res.ok)
                        throw new Error(
                          "Download failed"
                        );

                      const blob =
                        await res.blob();
                      const url =
                        URL.createObjectURL(blob);
                      const a =
                        document.createElement("a");
                      a.href = url;
                      a.download = name;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (e: any) {
                      notify(
                        "Download failed: " +
                          e.message
                      );
                    }
                  },
                  disabled:
                    selectedNames.size === 0 ||
                    primarySelected?.type === "dir",
                },
                {
                  label: "Upload",
                  onClick: uploadFile,
                  disabled: false,
                },
                ...(view === "editor"
                  ? [
                      {
                        label: editorDirty
                          ? "Save*"
                          : "Save",
                        onClick: saveFile,
                        disabled: !editorDirty,
                      },
                    ]
                  : []),
                ...(view !== "files"
                  ? [
                      {
                        label: "← Files",
                        onClick: () =>
                          setView("files"),
                        disabled: false,
                      },
                    ]
                  : []),
                {
                  label:
                    selectedNames.size > 1
                      ? `Delete (${selectedNames.size})`
                      : "Delete",
                  onClick: deleteSelected,
                  disabled: selectedNames.size === 0,
                  danger: true,
                },
              ].map(
                ({
                  label,
                  onClick,
                  disabled,
                  danger,
                }: any) => (
                  <button
                    key={label}
                    className={
                      "abtn" +
                      (danger ? " danger" : "")
                    }
                    onClick={onClick}
                    disabled={disabled}
                    style={{
                      background: "transparent",
                      border: `1px solid ${t.border}`,
                      borderRadius: 4,
                      padding: `${
                        isMobile ? 4 : 5
                      }px ${isMobile ? 8 : 11}px`,
                      fontSize: isMobile
                        ? 11
                        : 12,
                      color: t.textDim,
                      cursor: disabled
                        ? "not-allowed"
                        : "pointer",
                      fontFamily: "inherit",
                      opacity: disabled ? 0.3 : 1,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {label}
                  </button>
                )
              )}

              {selectedNames.size > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    color: t.textDim,
                    marginLeft: 4,
                  }}
                >
                  {selectedNames.size} selected
                </span>
              )}
            </div>

            {/* Content */}
            <div
              style={{
                flex: 1,
                display: "flex",
                overflow: "hidden",
                minHeight: 0,
              }}
            >
              {view === "terminal" ? (
                <Terminal
                  config={config}
                  token={token}
                  currentPath={currentPath}
                  onCdDetected={(p) =>
                    setCurrentPath(p)
                  }
                  t={t}
                />
              ) : view === "editor" ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      background: t.bg2,
                      borderBottom: `1px solid ${t.border}`,
                      padding: "5px 14px",
                      fontSize: 12,
                      color: t.textMid,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span>
                      {primarySelected?.name}
                    </span>
                    {editorDirty && (
                      <span
                        style={{ color: t.yellow }}
                      >
                        ●
                      </span>
                    )}
                  </div>

                  <textarea
                    value={editorContent}
                    onChange={(e) => {
                      setEditorContent(
                        e.target.value
                      );
                      setEditorDirty(true);
                    }}
                    spellCheck={false}
                    style={{
                      flex: 1,
                      background: t.editorBg,
                      color: t.text,
                      border: "none",
                      outline: "none",
                      padding: "14px 16px",
                      fontSize: isMobile
                        ? 12
                        : 14,
                      lineHeight: 1.7,
                      resize: "none",
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    overflow: "hidden",
                  }}
                >
                  <div
                    ref={gridRef}
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: isMobile ? 8 : 12,
                      display: "grid",
                      gridTemplateColumns: `repeat(auto-fill, minmax(${cellMin}px, 1fr))`,
                      gap: isMobile ? 4 : 6,
                      alignContent: "start",
                      position: "relative",
                    }}
                    onMouseDown={onGridMouseDown}
                  >
                    <div
                      ref={bandRef}
                      className="band-select"
                    />

                    {loading ? (
                      <div
                        style={{
                          padding: 24,
                          color: t.textDim,
                          fontSize: 13,
                        }}
                      >
                        Loading...
                      </div>
                    ) : files.length === 0 ? (
                      <div
                        style={{
                          padding: 24,
                          color: t.textDim,
                          fontSize: 13,
                        }}
                      >
                        Empty directory
                      </div>
                    ) : (
                      files.map((f, i) => {
                        const isSel =
                          selectedNames.has(f.name);
                        return (
                          <div
                            key={i}
                            data-fcell={f.name}
                            className={
                              "fcell" +
                              (isSel ? " sel" : "")
                            }
                            onClick={(e) =>
                              handleFileClick(f, e)
                            }
                            onDoubleClick={() =>
                              handleFileDoubleClick(
                                f
                              )
                            }
                          >
                            <FileIcon
                              item={f}
                              size={iconSize}
                              t={t}
                            />
                            <span
                              className="fn"
                              style={{
                                fontSize,
                                color: t.textDim,
                                textAlign: "center",
                                wordBreak:
                                  "break-all",
                                lineHeight: 1.3,
                                maxWidth:
                                  cellMin - 8,
                                overflow: "hidden",
                                display:
                                  "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient:
                                  "vertical" as const,
                              }}
                            >
                              {f.name}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {showPreview && (
                    <div
                      style={{
                        width: previewW,
                        background: t.bg2,
                        borderLeft: `1px solid ${t.border}`,
                        display: "flex",
                        flexDirection: "column",
                        flexShrink: 0,
                        overflow: "hidden",
                      }}
                    >
                      <RichPreview
                        item={primarySelected}
                        config={config}
                        token={token}
                        currentPath={currentPath}
                        t={t}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {notification && (
          <div
            style={{
              position: "fixed",
              bottom: 20,
              right: 20,
              background: t.notifBg,
              border: `1px solid ${t.border2}`,
              borderRadius: 5,
              padding: "10px 18px",
              fontSize: 13,
              color:
                theme === "dark"
                  ? "#c8c8c8"
                  : "#fff",
              zIndex: 9999,
              boxShadow:
                "0 4px 20px rgba(0,0,0,0.4)",
            }}
          >
            {notification}
          </div>
        )}
      </div>
    </>
  );
}

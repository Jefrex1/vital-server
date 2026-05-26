"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { SSHConfig } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { useWebSocket } from "@/hooks/useWebSocket";

interface SavedCommand { id: number; label: string; command: string; }

interface TerminalProps {
  config: SSHConfig;
  token: string;
  currentPath: string;
  onCdDetected: (p: string) => void;
  t: typeof THEMES.dark;
}

export function Terminal({ config, token, currentPath, onCdDetected, t }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "connecting" | "ready" | "closed">("loading");
  const [savedCmds, setSavedCmds] = useState<SavedCommand[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saveCmd, setSaveCmd] = useState("");
  const [saveErr, setSaveErr] = useState("");

  const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function loadCmds() {
    const r = await fetch(`${API}/saved-commands`, { headers: hdr });
    if (r.ok) setSavedCmds(await r.json());
  }

  async function saveCommand() {
    if (!saveLabel.trim() || !saveCmd.trim()) { setSaveErr("Заповни обидва поля"); return; }
    const r = await fetch(`${API}/saved-commands`, { method: "POST", headers: hdr, body: JSON.stringify({ label: saveLabel.trim(), command: saveCmd.trim() }) });
    if (r.ok) { setShowSave(false); setSaveLabel(""); setSaveCmd(""); setSaveErr(""); loadCmds(); }
    else { const d = await r.json(); setSaveErr(d.error || "Помилка"); }
  }

  async function deleteCmd(id: number) {
    await fetch(`${API}/saved-commands/${id}`, { method: "DELETE", headers: hdr });
    loadCmds();
  }

  function runCmd(command: string) {
    if (xtermRef.current) {
      const { send } = wsRef.current || {};
      sendRef.current?.({ type: "terminal:input", data: command + "\n" });
      xtermRef.current.focus();
    }
  }

  const sendRef = useRef<((msg: any) => void) | null>(null);
  const wsRef = useRef<any>(null);

  const { send } = useWebSocket(
    useCallback((msg: any) => {
      if (msg.type === "terminal:ready") setStatus("ready");
      if (msg.type === "terminal:data" && xtermRef.current)
        xtermRef.current.write(msg.data);
      if (msg.type === "terminal:closed" && xtermRef.current) {
        setStatus("closed");
        xtermRef.current.write("\r\n\x1b[31m[session closed]\x1b[0m\r\n");
      }
    }, [])
  );

  useEffect(() => { sendRef.current = send; }, [send]);

  useEffect(() => { loadCmds(); }, []);

  useEffect(() => {
    function loadScript(src: string, g: string): Promise<void> {
      return new Promise((res, rej) => {
        if ((window as any)[g] !== undefined) { res(); return; }
        const ex = document.querySelector(`script[src="${src}"]`);
        if (ex) { ex.addEventListener("load", () => res()); ex.addEventListener("error", rej); return; }
        const s = document.createElement("script");
        s.src = src; s.onload = () => res(); s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    function loadCss(href: string) {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href;
      document.head.appendChild(l);
    }

    async function init() {
      loadCss("https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css");
      await loadScript("https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js", "Terminal");
      await loadScript("https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js", "FitAddon");

      const w = window as any;
      const term = new w.Terminal({
        theme: {
          background: t.editorBg, foreground: t.text, cursor: t.accent,
          cursorAccent: t.bg, selectionBackground: t.selBg,
          black: "#000000", red: t.red, green: t.green, yellow: t.yellow, blue: t.accent, white: t.text,
        },
        fontFamily: "'Roboto Mono', monospace",
        fontSize: 13, lineHeight: 1.4, cursorBlink: true, cursorStyle: "block", scrollback: 5000,
      });

      const FitAddonCtor = w.FitAddon?.FitAddon ?? w.FitAddon;
      const fitAddon = new FitAddonCtor();
      term.loadAddon(fitAddon);
      term.open(containerRef.current!);
      fitAddon.fit();
      xtermRef.current = term;

      term.onData((data: string) => send({ type: "terminal:input", data }));
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => send({ type: "terminal:resize", cols, rows }));

      const ro = new ResizeObserver(() => { try { fitAddon.fit(); } catch {} });
      if (containerRef.current) ro.observe(containerRef.current);

      setStatus("connecting");
      send({ type: "auth", token });

      setTimeout(() => {
        const payload: any = { type: "terminal:start", cols: term.cols, rows: term.rows };
        if (config.id) payload.configId = config.id;
        else Object.assign(payload, { host: config.host, username: config.username, password: config.password, port: config.port, ssh_key: config.ssh_key, auth_type: config.auth_type });
        if (config.provision_root_path) payload.provision_root_path = config.provision_root_path;
        send(payload);
      }, 200);

      term.focus();
      return () => { ro.disconnect(); term.dispose(); };
    }

    const cleanup = init();
    return () => { cleanup.then((fn) => fn?.()); };
  }, [t]); // eslint-disable-line

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: t.editorBg, position: "relative", minHeight: 0 }}>
      {/* Saved commands bar */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flexShrink: 0, background: t.bg2 }}>
        <span style={{ fontSize: 10, color: t.textDim, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>Команди:</span>
        {savedCmds.map(cmd => (
          <div key={cmd.id} style={{ display: "flex", alignItems: "center", gap: 0, background: t.bg4, border: `1px solid ${t.border2}`, borderRadius: 4, overflow: "hidden" }}>
            <button
              onClick={() => runCmd(cmd.command)}
              title={cmd.command}
              style={{ background: "transparent", border: "none", color: t.text, fontSize: 11, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              {cmd.label}
            </button>
            <button
              onClick={() => deleteCmd(cmd.id)}
              style={{ background: "transparent", border: "none", borderLeft: `1px solid ${t.border}`, color: t.textDim, fontSize: 11, padding: "3px 5px", cursor: "pointer", lineHeight: 1 }}
              title="Видалити"
            >×</button>
          </div>
        ))}
        <button
          onClick={() => setShowSave(s => !s)}
          style={{ background: "transparent", border: `1px solid ${t.border2}`, borderRadius: 4, color: t.accent, fontSize: 11, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
        >
          + Зберегти
        </button>
      </div>

      {/* Save command form */}
      {showSave && (
        <div style={{ borderBottom: `1px solid ${t.border}`, padding: "8px 10px", display: "flex", gap: 6, alignItems: "center", flexShrink: 0, background: t.bg3 || t.bg2 }}>
          <input
            placeholder="Назва"
            value={saveLabel}
            onChange={e => setSaveLabel(e.target.value)}
            style={{ background: t.bg2, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "4px 8px", fontSize: 12, color: t.text, fontFamily: "inherit", outline: "none", width: 120 }}
          />
          <input
            placeholder="команда..."
            value={saveCmd}
            onChange={e => setSaveCmd(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") saveCommand(); if (e.key === "Escape") setShowSave(false); }}
            style={{ background: t.bg2, border: `1px solid ${t.border2}`, borderRadius: 4, padding: "4px 8px", fontSize: 12, color: t.text, fontFamily: "monospace", outline: "none", flex: 1 }}
          />
          {saveErr && <span style={{ fontSize: 11, color: t.red }}>{saveErr}</span>}
          <button onClick={saveCommand} style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: t.accent, cursor: "pointer", fontFamily: "inherit" }}>
            Зберегти
          </button>
          <button onClick={() => { setShowSave(false); setSaveErr(""); }} style={{ background: "transparent", border: `1px solid ${t.border2}`, borderRadius: 4, padding: "4px 8px", fontSize: 11, color: t.textDim, cursor: "pointer", fontFamily: "inherit" }}>
            Скасувати
          </button>
        </div>
      )}

      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: t.textDim, fontSize: 12, fontFamily: "monospace", zIndex: 2 }}>
          Loading terminal…
        </div>
      )}
      {status === "connecting" && (
        <div style={{ padding: "5px 14px", fontSize: 11, color: t.textDim, borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          Connecting SSH shell…
        </div>
      )}
      <div ref={containerRef} style={{ flex: 1, padding: "6px 4px", minHeight: 0 }} />
    </div>
  );
}

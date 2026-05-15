"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { SSHConfig } from "@/types";
import { THEMES } from "@/constants/themes";
import { useWebSocket } from "@/hooks/useWebSocket";

interface TerminalProps {
  config: SSHConfig;
  token: string;
  currentPath: string;
  onCdDetected: (p: string) => void;
  t: typeof THEMES.dark;
}

export function Terminal({
  config,
  token,
  currentPath,
  onCdDetected,
  t,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "connecting" | "ready" | "closed">("loading");

  const { send } = useWebSocket(
    useCallback((msg: any) => {
      if (msg.type === "terminal:ready") setStatus("ready");
      if (msg.type === "terminal:data" && xtermRef.current)
        xtermRef.current.write(msg.data);
      if (msg.type === "terminal:closed" && xtermRef.current) {
        setStatus("closed");
        xtermRef.current.write(
          "\r\n\x1b[31m[session closed]\x1b[0m\r\n"
        );
      }
    }, [])
  );

  useEffect(() => {
    function loadScript(
      src: string,
      g: string
    ): Promise<void> {
      return new Promise((res, rej) => {
        if ((window as any)[g] !== undefined) {
          res();
          return;
        }
        const ex = document.querySelector(
          `script[src="${src}"]`
        );
        if (ex) {
          ex.addEventListener("load", () => res());
          ex.addEventListener("error", rej);
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => res();
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    function loadCss(href: string) {
      if (document.querySelector(`link[href="${href}"]`))
        return;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    }

    async function init() {
      loadCss(
        "https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css"
      );
      await loadScript(
        "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js",
        "Terminal"
      );
      await loadScript(
        "https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js",
        "FitAddon"
      );

      const w = window as any;
      const term = new w.Terminal({
        theme: {
          background: t.editorBg,
          foreground: t.text,
          cursor: t.accent,
          cursorAccent: t.bg,
          selectionBackground: t.selBg,
          black: "#000000",
          red: t.red,
          green: t.green,
          yellow: t.yellow,
          blue: t.accent,
          white: t.text,
        },
        fontFamily: "'Roboto Mono', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: "block",
        scrollback: 5000,
      });

      const FitAddonCtor =
        w.FitAddon?.FitAddon ?? w.FitAddon;
      const fitAddon = new FitAddonCtor();
      term.loadAddon(fitAddon);
      term.open(containerRef.current!);
      fitAddon.fit();
      xtermRef.current = term;

      term.onData((data: string) =>
        send({ type: "terminal:input", data })
      );
      term.onResize(
        ({ cols, rows }: { cols: number; rows: number }) =>
          send({ type: "terminal:resize", cols, rows })
      );

      const ro = new ResizeObserver(() => {
        try {
          fitAddon.fit();
        } catch {}
      });
      if (containerRef.current) ro.observe(containerRef.current);

      setStatus("connecting");
      send({ type: "auth", token });

      setTimeout(() => {
        const payload: any = {
          type: "terminal:start",
          cols: term.cols,
          rows: term.rows,
        };
        if (config.id) payload.configId = config.id;
        else
          Object.assign(payload, {
            host: config.host,
            username: config.username,
            password: config.password,
            port: config.port,
            ssh_key: config.ssh_key,
            auth_type: config.auth_type,
          });
        send(payload);
      }, 200);

      term.focus();

      return () => {
        ro.disconnect();
        term.dispose();
      };
    }

    const cleanup = init();
    return () => {
      cleanup.then((fn) => fn?.());
    };
  }, [t]); // eslint-disable-line

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: t.editorBg,
        position: "relative",
      }}
    >
      {status === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: t.textDim,
            fontSize: 12,
            fontFamily: "monospace",
            zIndex: 2,
          }}
        >
          Loading terminal…
        </div>
      )}
      {status === "connecting" && (
        <div
          style={{
            padding: "5px 14px",
            fontSize: 11,
            color: t.textDim,
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          Connecting SSH shell…
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          padding: "6px 4px",
          minHeight: 0,
        }}
      />
    </div>
  );
}

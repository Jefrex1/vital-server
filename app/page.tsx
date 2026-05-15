"use client";

import { useState, useEffect } from "react";
import type { AuthUser, SSHConfig, Theme } from "@/types";
import { THEMES } from "@/constants/themes";
import { LoginScreen } from "@/components/LoginScreen";
import { ConfigPicker } from "@/components/ConfigPicker";
import { AdminPanel } from "@/components/AdminPanel";
import { FileManager } from "@/components/FileManager";

export default function Page() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string>("");
  const [config, setConfig] = useState<SSHConfig | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const t = THEMES[theme];

  useEffect(() => {
    try {
      const savedUser = sessionStorage.getItem("oserver_user");
      const savedToken = sessionStorage.getItem("oserver_token");
      const savedCfg = sessionStorage.getItem("oserver_config");
      const savedTheme = sessionStorage.getItem("oserver_theme") as Theme;

      if (savedUser && savedToken) {
        setAuthUser(JSON.parse(savedUser));
        setToken(savedToken);
      }
      if (savedCfg) setConfig(JSON.parse(savedCfg));
      if (savedTheme === "light" || savedTheme === "dark")
        setTheme(savedTheme);
    } catch {}

    setSessionLoaded(true);
  }, []);

  function handleLogin(user: AuthUser, tok: string) {
    setAuthUser(user);
    setToken(tok);
    try {
      sessionStorage.setItem("oserver_user", JSON.stringify(user));
      sessionStorage.setItem("oserver_token", tok);
    } catch {}
  }

  function handleLogout() {
    setAuthUser(null);
    setToken("");
    setConfig(null);
    try {
      sessionStorage.clear();
    } catch {}
  }

  function handleConnect(cfg: SSHConfig) {
    setConfig(cfg);
    try {
      sessionStorage.setItem("oserver_config", JSON.stringify(cfg));
    } catch {}
  }

  function handleDisconnect() {
    setConfig(null);
    try {
      sessionStorage.removeItem("oserver_config");
    } catch {}
  }

  function handleThemeChange(newTheme: Theme) {
    setTheme(newTheme);
    try {
      sessionStorage.setItem("oserver_theme", newTheme);
    } catch {}
  }

  if (!sessionLoaded) return null;
  if (!authUser)
    return <LoginScreen onLogin={handleLogin} />;
  if (!config)
    return (
      <ConfigPicker
        token={token}
        onConnect={handleConnect}
        t={t}
      />
    );
  if (showAdmin)
    return (
      <AdminPanel
        token={token}
        t={t}
        onClose={() => setShowAdmin(false)}
      />
    );

  return (
    <FileManager
      authUser={authUser}
      token={token}
      config={config}
      theme={theme}
      onThemeChange={handleThemeChange}
      onAdminClick={() => setShowAdmin(true)}
      onLogout={handleLogout}
      onDisconnect={handleDisconnect}
    />
  );
}

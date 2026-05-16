"use client";

import { useState, useEffect } from "react";
import type { AuthUser, SSHConfig, Theme } from "@/types";
import { THEMES } from "@/constants/themes";
import { LoginScreen } from "@/components/LoginScreen";
import { RegisterScreen } from "@/components/RegisterScreen";
import { ConfigPicker } from "@/components/ConfigPicker";
import { AdminPanel } from "@/components/AdminPanel";
import { FileManager } from "@/components/FileManager";
import { GroupsPanel } from "@/components/GroupsPanel";
import { AccountSettings } from "@/components/AccountSettings";

type Screen = "login" | "register";
type AppView = "picker" | "groups" | "account" | "file-manager" | "admin";

export default function Page() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string>("");
  const [config, setConfig] = useState<SSHConfig | null>(null);
  const [view, setView] = useState<AppView>("picker");
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>("login");

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
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch {}
    setSessionLoaded(true);
  }, []);

  function handleLogin(user: AuthUser, tok: string) {
    setAuthUser(user);
    setToken(tok);
    setScreen("login");
    setView("picker");
    try {
      sessionStorage.setItem("oserver_user", JSON.stringify(user));
      sessionStorage.setItem("oserver_token", tok);
    } catch {}
  }

  function handleLogout() {
    setAuthUser(null);
    setToken("");
    setConfig(null);
    setScreen("login");
    setView("picker");
    try { sessionStorage.clear(); } catch {}
  }

  function handleConnect(cfg: SSHConfig) {
    setConfig(cfg);
    setView("file-manager");
    try { sessionStorage.setItem("oserver_config", JSON.stringify(cfg)); } catch {}
  }

  function handleDisconnect() {
    setConfig(null);
    setView("picker");
    try { sessionStorage.removeItem("oserver_config"); } catch {}
  }

  function handleThemeChange(newTheme: Theme) {
    setTheme(newTheme);
    try { sessionStorage.setItem("oserver_theme", newTheme); } catch {}
  }

  if (!sessionLoaded) return null;

  // Not logged in
  if (!authUser) {
    if (screen === "register") {
      return <RegisterScreen onRegister={handleLogin} onBackToLogin={() => setScreen("login")} />;
    }
    return <LoginScreen onLogin={handleLogin} onRegister={() => setScreen("register")} />;
  }

  // Groups view — accessible without server
  if (view === "groups") {
    return (
      <GroupsPanel
        token={token}
        authUser={authUser}
        t={t}
        onClose={() => setView("picker")}
      />
    );
  }

  // Account settings — accessible without server
  if (view === "account") {
    return (
      <AccountSettings
        token={token}
        authUser={authUser}
        t={t}
        onClose={() => setView("picker")}
        onThemeChange={handleThemeChange}
      />
    );
  }

  // Admin panel
  if (view === "admin") {
    return (
      <AdminPanel
        token={token}
        t={t}
        onClose={() => setView(config ? "file-manager" : "picker")}
      />
    );
  }

  // File manager (needs server)
  if (view === "file-manager" && config) {
    return (
      <FileManager
        authUser={authUser}
        token={token}
        config={config}
        theme={theme}
        onThemeChange={handleThemeChange}
        onAdminClick={() => setView("admin")}
        onGroupsClick={() => setView("groups")}
        onAccountClick={() => setView("account")}
        onLogout={handleLogout}
        onDisconnect={handleDisconnect}
      />
    );
  }

  // Server picker (default after login)
  return (
    <ConfigPicker
      token={token}
      authUser={authUser}
      onConnect={handleConnect}
      t={t}
      onGroupsClick={() => setView("groups")}
      onAccountClick={() => setView("account")}
      onAdminClick={authUser.role === "admin" ? () => setView("admin") : undefined}
      onLogout={handleLogout}
    />
  );
}

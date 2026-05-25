"use client";

import { useState, useEffect, useCallback } from "react";
import type { AuthUser, SSHConfig, Theme } from "@/types";
import { THEMES, API } from "@/constants/themes";
import { LoginScreen } from "@/components/LoginScreen";
import { RegisterScreen } from "@/components/RegisterScreen";
import { ConfigPicker } from "@/components/ConfigPicker";
import { AdminPanel } from "@/components/AdminPanel";
import { FileManager } from "@/components/FileManager";
import { GroupsPanel } from "@/components/GroupsPanel";
import { AccountSettings } from "@/components/AccountSettings";
import type { Language } from "@/i18n";

type Screen = "login" | "register";
type AppView = "picker" | "groups" | "account" | "file-manager" | "admin";

const VIEW_TO_PATH: Record<AppView, string> = {
  picker: "/",
  groups: "/groups",
  account: "/account",
  "file-manager": "/files",
  admin: "/admin",
};

const PATH_TO_VIEW: Record<string, AppView> = {
  "/": "picker",
  "/groups": "groups",
  "/account": "account",
  "/files": "file-manager",
  "/admin": "admin",
};

export default function Page() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string>("");
  const [config, setConfig] = useState<SSHConfig | null>(null);
  const [view, setView] = useState<AppView>("picker");
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>("login");
  const [language, setLanguage] = useState<Language>("uk");

  const t = (THEMES as Record<string, typeof THEMES.dark>)[theme] ?? THEMES.dark;

  // Navigate with URL update
  const navigate = useCallback((newView: AppView, replace = false) => {
    const path = VIEW_TO_PATH[newView];
    if (replace) {
      window.history.replaceState({ view: newView }, "", path);
    } else {
      window.history.pushState({ view: newView }, "", path);
    }
    setView(newView);
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const v = e.state?.view as AppView | undefined;
      if (v) setView(v);
      else {
        const fromPath = PATH_TO_VIEW[window.location.pathname];
        setView(fromPath || "picker");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // On load — restore session and set initial URL state
  useEffect(() => {
    try {
      const savedUser = sessionStorage.getItem("oserver_user");
      const savedToken = sessionStorage.getItem("oserver_token");
      const savedCfg = sessionStorage.getItem("oserver_config");
      const savedTheme = sessionStorage.getItem("oserver_theme") as Theme;
      const savedLanguage = sessionStorage.getItem("oserver_language") as Language;

      if (savedUser && savedToken) {
        setAuthUser(JSON.parse(savedUser));
        setToken(savedToken);
      }
      if (savedCfg) setConfig(JSON.parse(savedCfg));
      const validThemes: Theme[] = ["dark", "light", "void", "lakers", "electric", "forest", "neon", "void-light", "lakers-light", "electric-light", "forest-light", "neon-light"];
      if (validThemes.includes(savedTheme as Theme)) setTheme(savedTheme as Theme);
      if (savedLanguage === "uk" || savedLanguage === "en") setLanguage(savedLanguage);

      // Restore view from URL
      const fromPath = PATH_TO_VIEW[window.location.pathname];
      const initialView: AppView = fromPath || "picker";
      setView(initialView);
      window.history.replaceState({ view: initialView }, "", VIEW_TO_PATH[initialView]);
    } catch {}
    setSessionLoaded(true);
  }, []);

  function handleLogin(user: AuthUser, tok: string) {
    setAuthUser(user);
    setToken(tok);
    setScreen("login");
    navigate("picker", true);
    try {
      sessionStorage.setItem("oserver_user", JSON.stringify(user));
      sessionStorage.setItem("oserver_token", tok);
    } catch {}
    // Load theme and language from DB
    fetch(`${API}/account/settings`, {
      headers: { Authorization: `Bearer ${tok}` },
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      const validThemes: Theme[] = ["dark","light","void","lakers","electric","forest","neon","void-light","lakers-light","electric-light","forest-light","neon-light"];
      if (validThemes.includes(d.theme)) { setTheme(d.theme); try { sessionStorage.setItem("oserver_theme", d.theme); } catch {} }
      if (d.language === "uk" || d.language === "en") { setLanguage(d.language); try { sessionStorage.setItem("oserver_language", d.language); } catch {} }
    }).catch(() => {});
  }

  function handleLogout() {
    setAuthUser(null);
    setToken("");
    setConfig(null);
    setScreen("login");
    navigate("picker", true);
    try { sessionStorage.clear(); } catch {}
  }

  function handleConnect(cfg: SSHConfig) {
    setConfig(cfg);
    navigate("file-manager");
    try { sessionStorage.setItem("oserver_config", JSON.stringify(cfg)); } catch {}
  }

  function handleDisconnect() {
    setConfig(null);
    navigate("picker");
    try { sessionStorage.removeItem("oserver_config"); } catch {}
  }

  function handleThemeChange(newTheme: Theme) {
    setTheme(newTheme);
    try { sessionStorage.setItem("oserver_theme", newTheme); } catch {}
  }

  function handleLanguageChange(newLanguage: Language) {
    setLanguage(newLanguage);
    try { sessionStorage.setItem("oserver_language", newLanguage); } catch {}
  }

  if (!sessionLoaded) return null;

  if (!authUser) {
    if (screen === "register") {
      return <RegisterScreen onRegister={handleLogin} onBackToLogin={() => setScreen("login")} />;
    }
    return <LoginScreen onLogin={handleLogin} onRegister={() => setScreen("register")} />;
  }

  if (view === "groups") {
    return <GroupsPanel token={token} authUser={authUser} t={t} language={language} onLanguageChange={handleLanguageChange} onClose={() => navigate(config ? "file-manager" : "picker")} />;
  }

  if (view === "account") {
    return <AccountSettings token={token} authUser={authUser} t={t} onClose={() => navigate(config ? "file-manager" : "picker")} onThemeChange={handleThemeChange} onLanguageChange={handleLanguageChange} />;
  }

  if (view === "admin") {
    return <AdminPanel token={token} t={t} language={language} onLanguageChange={handleLanguageChange} onClose={() => navigate(config ? "file-manager" : "picker")} />;
  }

  if (view === "file-manager" && config) {
    return (
      <FileManager
        authUser={authUser}
        token={token}
        config={config}
        theme={theme}
        language={language}
        onThemeChange={handleThemeChange}
        onLanguageChange={handleLanguageChange}
        onAdminClick={() => navigate("admin")}
        onGroupsClick={() => navigate("groups")}
        onAccountClick={() => navigate("account")}
        onLogout={handleLogout}
        onDisconnect={handleDisconnect}
      />
    );
  }

  return (
    <ConfigPicker
      token={token}
      authUser={authUser}
      onConnect={handleConnect}
      t={t}
      language={language}
      onLanguageChange={handleLanguageChange}
      onGroupsClick={() => navigate("groups")}
      onAccountClick={() => navigate("account")}
      onAdminClick={authUser.role === "admin" ? () => navigate("admin") : undefined}
      onLogout={handleLogout}
    />
  );
}

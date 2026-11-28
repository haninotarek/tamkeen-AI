import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  authApi,
  clearSession,
  getToken,
  readCachedUser,
  saveSession,
} from "../../api";

/**
 * عضو 1 — إدارة حالة الحساب بشكل ديناميكي:
 * قراءة الجلسة من التوكن، مزامنتها مع /api/auth/me، وتسجيل الدخول/الخروج.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readCachedUser());
  const [initializing, setInitializing] = useState(true);
  const [googleClientId, setGoogleClientId] = useState("");

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setInitializing(false);
      return null;
    }
    try {
      const data = await authApi.me();
      setUser(data.user);
      setGoogleClientId(data.googleClientId || "");
      saveSession(null, data.user);
      return data.user;
    } catch {
      clearSession();
      setUser(null);
      return null;
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => setUser(null);
    const onChanged = () => setUser(readCachedUser());
    window.addEventListener("tamkeen:unauthorized", onUnauthorized);
    window.addEventListener("tamkeen:auth-changed", onChanged);
    return () => {
      window.removeEventListener("tamkeen:unauthorized", onUnauthorized);
      window.removeEventListener("tamkeen:auth-changed", onChanged);
    };
  }, [refresh]);

  const applySession = useCallback((data) => {
    saveSession(data.token, data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(
    async (email, password) => applySession(await authApi.login(email, password)),
    [applySession]
  );

  const register = useCallback(
    async (payload) => applySession(await authApi.register(payload)),
    [applySession]
  );

  const loginWithGoogle = useCallback(
    async (payload) => applySession(await authApi.googleLogin(payload)),
    [applySession]
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      initializing,
      googleClientId,
      login,
      register,
      loginWithGoogle,
      logout,
      refresh,
      setUser,
    }),
    [user, initializing, googleClientId, login, register, loginWithGoogle, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export default AuthContext;

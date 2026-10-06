"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  api,
  setUnauthorizedListener,
  type AuthUser,
  type LoginPayload,
  type OtpRequestPayload,
  type OtpRequestResult,
  type RegisterPayload,
  type RegisterWithOtpPayload,
} from "@/lib/api";
import { Splash } from "@/components/ui/Splash";

const TOKEN_STORAGE_KEY = "signal_clone_token";

interface AuthContextValue {
  currentUser: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  requestOtp: (payload: OtpRequestPayload) => Promise<OtpRequestResult>;
  verifyOtpAndRegister: (payload: RegisterWithOtpPayload) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Runs once on mount — browser-only, so it must live in an effect, never
  // during render (which may be server-rendered and has no localStorage).
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!stored) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const user = await api.me(stored);
        if (!cancelled) {
          setToken(stored);
          setCurrentUser(user);
        }
      } catch {
        // Invalid/expired token — drop it and fall through to logged-out state.
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const { access_token: accessToken } = await api.login(payload);
    const user = await api.me(accessToken);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    setToken(accessToken);
    setCurrentUser(user);
  }, []);

  const register = useCallback((payload: RegisterPayload) => api.register(payload), []);
  const requestOtp = useCallback((payload: OtpRequestPayload) => api.requestRegistrationOtp(payload), []);
  const verifyOtpAndRegister = useCallback(
    (payload: RegisterWithOtpPayload) => api.verifyRegistrationOtp(payload),
    [],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
  }, []);

  // A 401 from any authenticated request (not /auth/login's own 401, which
  // just means "wrong password") means the token died mid-session — expired,
  // revoked, whatever. Clear state the same way logout() does so the user
  // never sits on a screen that looks authenticated but silently 401s on
  // everything (Part K). WebSocketProvider already disconnects reactively
  // once `token` goes null; useRequireAuth() already redirects once
  // `currentUser` goes null — nothing else to wire up here.
  useEffect(() => {
    setUnauthorizedListener(logout);
    return () => setUnauthorizedListener(null);
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{ currentUser, token, loading, login, register, requestOtp, verifyOtpAndRegister, logout }}
    >
      {loading ? <Splash /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Use inside layouts/pages that require a signed-in user. */
export function useRequireAuth() {
  const { currentUser } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!currentUser) router.replace("/login");
  }, [currentUser, router]);
}

/** Use inside layouts/pages that should only be visible to signed-out users (login/register). */
export function useRedirectIfAuthenticated() {
  const { currentUser } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (currentUser) router.replace("/");
  }, [currentUser, router]);
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AuthSession, authApi } from "../api/client";
import { connectWebSocket, disconnectWebSocket } from "../api/ws";

interface AuthContextValue {
  session: AuthSession | null;
  loginUser: (username: string, password: string) => Promise<void>;
  loginDuty: (loginName: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => {
    const raw = localStorage.getItem("session");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  const persist = useCallback((s: AuthSession) => {
    localStorage.setItem("token", s.access_token);
    localStorage.setItem("session", JSON.stringify(s));
    setSession(s);
    connectWebSocket(s.access_token);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((me) => {
        const stored = localStorage.getItem("session");
        const parsed = stored ? JSON.parse(stored) : {};
        persist({ ...parsed, ...me, access_token: token });
      })
      .catch(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("session");
      })
      .finally(() => setLoading(false));
  }, [persist]);

  const loginUser = async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    persist(res);
  };

  const loginDuty = async (loginName: string, password: string) => {
    const res = await authApi.dutyLogin(loginName, password);
    persist(res);
  };

  const logout = () => {
    disconnectWebSocket();
    localStorage.removeItem("token");
    localStorage.removeItem("session");
    setSession(null);
  };

  const value = useMemo(
    () => ({ session, loginUser, loginDuty, logout, loading }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

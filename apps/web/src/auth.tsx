import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

export type Client = { id: string; name: string; code: string };

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  totpEnabled?: boolean;
};

export type LoginResult =
  | { requires2fa: false }
  | { requires2fa: true; pendingToken: string; email: string };

type AuthState = {
  user: AuthUser | null;
  clients: Client[];
  clientId: string | null;
  setClientId: (id: string) => void;
  login: (email: string, password: string, tenantSlug: string) => Promise<LoginResult>;
  complete2fa: (pendingToken: string, code: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function applySession(
  data: {
    token: string;
    user: AuthUser;
    clients: Client[];
  },
  setUser: (u: AuthUser) => void,
  setClients: (c: Client[]) => void,
  setClientId: (id: string) => void
) {
  localStorage.setItem("cb_token", data.token);
  setUser(data.user);
  setClients(data.clients);
  const existing = localStorage.getItem("cb_client");
  if (existing && data.clients.some((c) => c.id === existing)) {
    setClientId(existing);
  } else if (data.clients[0]) {
    setClientId(data.clients[0].id);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientIdState] = useState<string | null>(
    localStorage.getItem("cb_client")
  );
  const [loading, setLoading] = useState(true);

  const setClientId = useCallback((id: string) => {
    localStorage.setItem("cb_client", id);
    setClientIdState(id);
  }, []);

  const refreshMe = useCallback(async () => {
    const r = await api.get("/auth/me");
    setUser(r.data.user);
    setClients(r.data.clients);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("cb_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => {
        setUser(r.data.user);
        setClients(r.data.clients);
        if (!localStorage.getItem("cb_client") && r.data.clients[0]) {
          setClientId(r.data.clients[0].id);
        }
      })
      .catch(() => {
        localStorage.removeItem("cb_token");
      })
      .finally(() => setLoading(false));
  }, [setClientId]);

  const login = useCallback(
    async (email: string, password: string, tenantSlug: string): Promise<LoginResult> => {
      const r = await api.post("/auth/login", { email, password, tenantSlug });
      if (r.data.requires2fa) {
        return {
          requires2fa: true,
          pendingToken: r.data.pendingToken as string,
          email: (r.data.user?.email as string) || email,
        };
      }
      applySession(r.data, setUser, setClients, setClientId);
      return { requires2fa: false };
    },
    [setClientId]
  );

  const complete2fa = useCallback(
    async (pendingToken: string, code: string) => {
      const r = await api.post("/auth/login/2fa", { pendingToken, code });
      applySession(r.data, setUser, setClients, setClientId);
    },
    [setClientId]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("cb_token");
    localStorage.removeItem("cb_client");
    setUser(null);
    setClients([]);
    setClientIdState(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      clients,
      clientId,
      setClientId,
      login,
      complete2fa,
      logout,
      loading,
      refreshMe,
    }),
    [user, clients, clientId, setClientId, login, complete2fa, logout, loading, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

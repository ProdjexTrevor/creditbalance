import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";

export function LoginPage() {
  const { user, login, complete2fa } = useAuth();
  const [email, setEmail] = useState("admin@demo.local");
  const [password, setPassword] = useState("password123");
  const [tenantSlug, setTenantSlug] = useState("demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

  if (user) return <Navigate to="/" replace />;

  function mapErr(err: unknown, fallback: string) {
    const ax = err as {
      response?: { status?: number; data?: { error?: string } };
    };
    if (!ax.response) {
      return "Cannot reach the API. Start Docker (MariaDB) and the API (pnpm dev:api on port 3010).";
    }
    return ax.response.data?.error || fallback;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await login(email, password, tenantSlug);
      if (result.requires2fa) {
        setPendingToken(result.pendingToken);
        setPendingEmail(result.email);
        setOtpCode("");
      }
    } catch (err: unknown) {
      setError(mapErr(err, "Login failed. Check tenant, email, and password."));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify2fa(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingToken) return;
    setBusy(true);
    setError("");
    try {
      await complete2fa(pendingToken, otpCode);
    } catch (err: unknown) {
      setError(mapErr(err, "Invalid authenticator or backup code."));
    } finally {
      setBusy(false);
    }
  }

  if (pendingToken) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={onVerify2fa}>
          <h1>Two-factor authentication</h1>
          <p>
            Enter the 6-digit code from your authenticator app
            {pendingEmail ? (
              <>
                {" "}
                for <strong>{pendingEmail}</strong>
              </>
            ) : null}
            . You can also use a backup code.
          </p>
          {error && <div className="error">{error}</div>}
          <div className="field">
            <label>Authenticator or backup code</label>
            <input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              autoFocus
              placeholder="123456"
            />
          </div>
          <button className="btn primary" type="submit" disabled={busy || !otpCode.trim()} style={{ width: "100%" }}>
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button
            className="btn ghost"
            type="button"
            style={{ width: "100%", marginTop: "0.5rem" }}
            onClick={() => {
              setPendingToken(null);
              setOtpCode("");
              setError("");
            }}
          >
            Back to sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Credit Balance</h1>
        <p>Multi-tenant credit balance workflow</p>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Tenant slug</label>
          <input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

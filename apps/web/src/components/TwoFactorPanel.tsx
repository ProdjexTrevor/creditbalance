import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

type Status = { enabled: boolean; backupCodesRemaining: number };

/** Shared OTP enroll / disable / backup-code UI for Profile (and legacy Security). */
export function TwoFactorPanel() {
  const { refreshMe } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{
    secret: string;
    qrDataUrl: string;
  } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenPassword, setRegenPassword] = useState("");
  const [regenCode, setRegenCode] = useState("");

  function loadStatus() {
    api.get("/auth/2fa/status").then((r) => setStatus(r.data));
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function startSetup() {
    setBusy(true);
    setError("");
    setBackupCodes(null);
    try {
      const r = await api.post("/auth/2fa/setup");
      setSetup({ secret: r.data.secret, qrDataUrl: r.data.qrDataUrl });
      setConfirmCode("");
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Could not start setup";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/auth/2fa/confirm", { code: confirmCode });
      setBackupCodes(r.data.backupCodes);
      setSetup(null);
      loadStatus();
      await refreshMe();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Invalid code";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function disable2fa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/2fa/disable", {
        password: disablePassword,
        code: disableCode,
      });
      setDisablePassword("");
      setDisableCode("");
      setBackupCodes(null);
      loadStatus();
      await refreshMe();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Could not disable";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function regenBackup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/auth/2fa/backup-codes", {
        password: regenPassword,
        code: regenCode,
      });
      setBackupCodes(r.data.backupCodes);
      setRegenPassword("");
      setRegenCode("");
      loadStatus();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Could not regenerate codes";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      <div className="grid cols-2">
        <div className="card stack">
          <h2>Authenticator app (OTP)</h2>
          <p className="muted" style={{ margin: 0 }}>
            Use Microsoft Authenticator, Google Authenticator, 1Password, or similar. After
            enabling, every sign-in asks for a 6-digit code (or a backup code).
          </p>
          {status && (
            <p>
              Status:{" "}
              <strong>{status.enabled ? "Enabled" : "Not enabled"}</strong>
              {status.enabled && (
                <>
                  {" "}
                  · Backup codes left: <strong>{status.backupCodesRemaining}</strong>
                </>
              )}
            </p>
          )}

          {!status?.enabled && !setup && (
            <button className="btn primary" type="button" disabled={busy} onClick={startSetup}>
              Set up authenticator
            </button>
          )}

          {setup && (
            <form className="stack" onSubmit={confirmSetup}>
              <p className="muted" style={{ margin: 0 }}>
                Scan this QR code, or enter the secret manually, then confirm with a code from
                the app.
              </p>
              <img
                src={setup.qrDataUrl}
                alt="Authenticator QR code"
                width={220}
                height={220}
                style={{ borderRadius: 8, background: "#fff" }}
              />
              <div className="field">
                <label>Manual secret</label>
                <input className="mono" readOnly value={setup.secret} />
              </div>
              <div className="field">
                <label>Enter 6-digit code to confirm</label>
                <input
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  inputMode="numeric"
                  pattern="\d{6}"
                  placeholder="123456"
                  required
                />
              </div>
              <div className="btn-row">
                <button className="btn primary" type="submit" disabled={busy}>
                  Confirm & enable
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setSetup(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {status?.enabled && !setup && (
            <form className="stack" onSubmit={disable2fa}>
              <h3 style={{ margin: 0 }}>Disable two-factor</h3>
              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Current OTP or backup code</label>
                <input
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  required
                />
              </div>
              <button className="btn danger" type="submit" disabled={busy}>
                Disable OTP
              </button>
            </form>
          )}
        </div>

        <div className="stack">
          {backupCodes && (
            <div className="card">
              <h2>Backup codes</h2>
              <p className="muted">
                Store these somewhere safe. Each code works once. They will not be shown again.
              </p>
              <ul className="mono" style={{ lineHeight: 1.8 }}>
                {backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <button
                className="btn"
                type="button"
                onClick={() => navigator.clipboard.writeText(backupCodes.join("\n"))}
              >
                Copy all
              </button>
            </div>
          )}

          {status?.enabled && (
            <div className="card">
              <h2>Regenerate backup codes</h2>
              <form className="stack" onSubmit={regenBackup}>
                <div className="field">
                  <label>Password</label>
                  <input
                    type="password"
                    value={regenPassword}
                    onChange={(e) => setRegenPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Current 6-digit code</label>
                  <input
                    value={regenCode}
                    onChange={(e) => setRegenCode(e.target.value)}
                    pattern="\d{6}"
                    required
                  />
                </div>
                <button className="btn" type="submit" disabled={busy}>
                  Generate new codes
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

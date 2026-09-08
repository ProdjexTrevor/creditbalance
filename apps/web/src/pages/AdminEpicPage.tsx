import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type EpicConfig = {
  enabled: boolean;
  environment: "SANDBOX" | "PRODUCTION";
  fhirBaseUrl: string;
  tokenUrl: string | null;
  epicClientId: string;
  hasPrivateKey: boolean;
  jwkKeyId: string | null;
  mrnSystem: string | null;
  scopes: string;
  lastTokenAt: string | null;
  lastError: string | null;
};

type Defaults = {
  fhirBaseUrl: string;
  tokenUrl: string;
  defaultMrnSystem: string;
  defaultScopes: string;
  jwksUrl?: string;
  defaultKid?: string;
};

type Preview = {
  epicPatientFhirId: string;
  mrn: string;
  firstName: string | null;
  lastName: string | null;
  accountNumber: string;
  primaryInsurance: string | null;
  planCode1: string | null;
  accountStatus: string | null;
};

export function AdminEpicPage() {
  const { clientId: routeClientId } = useParams<{ clientId: string }>();
  const { clientId: authClientId, clients } = useAuth();
  const clientId = routeClientId || authClientId || "";
  const clientName =
    clients.find((c) => c.id === clientId)?.name ?? "Selected client";

  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState<"SANDBOX" | "PRODUCTION">("SANDBOX");
  const [fhirBaseUrl, setFhirBaseUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [epicClientId, setEpicClientId] = useState("");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [jwkKeyId, setJwkKeyId] = useState("");
  const [mrnSystem, setMrnSystem] = useState("");
  const [scopes, setScopes] = useState("");
  const [hasPrivateKey, setHasPrivateKey] = useState(false);

  const [family, setFamily] = useState("");
  const [given, setGiven] = useState("");
  const [mrn, setMrn] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [results, setResults] = useState<Preview[]>([]);

  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [jwksUrl, setJwksUrl] = useState(
    "https://credit-balnace-api.vercel.app/.well-known/jwks.json"
  );

  const load = useCallback(() => {
    if (!clientId) return;
    api.get(`/epic/${clientId}/config`).then((r) => {
      setDefaults(r.data.defaults);
      if (r.data.defaults?.jwksUrl) setJwksUrl(r.data.defaults.jwksUrl);
      const c = r.data.config as EpicConfig | null;
      if (c) {
        setEnabled(c.enabled);
        setEnvironment(c.environment);
        setFhirBaseUrl(c.fhirBaseUrl);
        setTokenUrl(c.tokenUrl || r.data.defaults.tokenUrl);
        setEpicClientId(c.epicClientId);
        setJwkKeyId(c.jwkKeyId || "");
        setMrnSystem(c.mrnSystem || r.data.defaults.defaultMrnSystem);
        setScopes(c.scopes || r.data.defaults.defaultScopes);
        setHasPrivateKey(c.hasPrivateKey);
      } else {
        setFhirBaseUrl(r.data.defaults.fhirBaseUrl);
        setTokenUrl(r.data.defaults.tokenUrl);
        setMrnSystem(r.data.defaults.defaultMrnSystem);
        setScopes(r.data.defaults.defaultScopes);
        if (r.data.defaults.defaultKid) setJwkKeyId(r.data.defaults.defaultKid);
      }
    });
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await api.put(`/epic/${clientId}/config`, {
        enabled,
        environment,
        fhirBaseUrl,
        tokenUrl: tokenUrl || null,
        epicClientId,
        privateKeyPem: privateKeyPem.trim() ? privateKeyPem : undefined,
        jwkKeyId: jwkKeyId || null,
        mrnSystem: mrnSystem || null,
        scopes,
      });
      setPrivateKeyPem("");
      setMsg("Epic connection saved.");
      load();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Could not save config"
      );
    } finally {
      setBusy(false);
    }
  }

  async function fillSandboxKey() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await api.get("/epic/sandbox-setup");
      setJwksUrl(r.data.jwksUrl);
      setJwkKeyId(r.data.kid);
      setFhirBaseUrl(r.data.fhirBaseUrl);
      setTokenUrl(r.data.tokenUrl);
      setScopes(r.data.scopes);
      setEnabled(true);
      setEnvironment("SANDBOX");
      if (r.data.privateKeyPem) {
        setPrivateKeyPem(r.data.privateKeyPem);
        setMsg(
          "Sandbox key loaded. Paste your Epic Non-Production Client ID, Save, then Test connection. Also set Epic JWK Set URL to the URL shown below."
        );
      } else {
        setError(
          "Private key not available on this server. Copy apps/api/epic-jwks/sandbox-private.pem into the PEM field, or set EPIC_SANDBOX_PRIVATE_KEY on the API."
        );
      }
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Could not load sandbox key setup"
      );
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (!clientId) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await api.post(`/epic/${clientId}/test`);
      setMsg(r.data.message || "Connection OK");
      load();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Connection test failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function searchPatients() {
    if (!clientId) return;
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const r = await api.post(`/epic/${clientId}/search`, {
        family: family || undefined,
        given: given || undefined,
        mrn: mrn || undefined,
        birthdate: birthdate || undefined,
      });
      setResults(r.data.results);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Search failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function sync(mode: "DRY_RUN" | "APPLY") {
    if (!clientId) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await api.post(`/epic/${clientId}/sync`, {
        mode,
        family: family || undefined,
        given: given || undefined,
        mrn: mrn || undefined,
        birthdate: birthdate || undefined,
      });
      setResults(r.data.previews);
      setMsg(
        mode === "APPLY"
          ? `Synced ${r.data.syncedCount} account(s) from Epic.`
          : `Preview: ${r.data.matchedCount} patient(s) matched.`
      );
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Sync failed"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <h1>Admin · Epic FHIR</h1>
        <div className="btn-row">
          <Link className="btn" to="/admin/clients">
            Clients
          </Link>
          <Link className="btn" to="/import">
            CSV import
          </Link>
        </div>
      </div>

      {!clientId ? (
        <div className="card">
          <p>Select a <strong>Client</strong> in the sidebar, then open Epic FHIR again.</p>
        </div>
      ) : (
        <>
      <p className="muted">
        Facility: <strong>{clientName}</strong> — SMART Backend Services (FHIR R4).
        Register at{" "}
        <a href="https://fhir.epic.com" target="_blank" rel="noreferrer">
          fhir.epic.com
        </a>
        . Set Epic <strong>Non-Production JWK Set URL</strong> to:
      </p>
      <p className="mono" style={{ wordBreak: "break-all" }}>
        {jwksUrl}
      </p>

      {error && <div className="error">{error}</div>}
      {msg && <p className="muted">{msg}</p>}

      <div className="grid cols-2">
        <form className="card stack" onSubmit={saveConfig}>
          <h2>Connection</h2>
          <div className="btn-row">
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={fillSandboxKey}
            >
              Fill sandbox key + URLs
            </button>
          </div>
          <label className="field" style={{ flexDirection: "row", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enable Epic sync for this client
          </label>
          <div className="field">
            <label>Environment</label>
            <select
              value={environment}
              onChange={(e) =>
                setEnvironment(e.target.value as "SANDBOX" | "PRODUCTION")
              }
            >
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production (per customer URL)</option>
            </select>
          </div>
          <div className="field">
            <label>FHIR base URL</label>
            <input
              value={fhirBaseUrl}
              onChange={(e) => setFhirBaseUrl(e.target.value)}
              placeholder={defaults?.fhirBaseUrl}
              required
            />
          </div>
          <div className="field">
            <label>Token URL</label>
            <input
              value={tokenUrl}
              onChange={(e) => setTokenUrl(e.target.value)}
              placeholder={defaults?.tokenUrl}
            />
          </div>
          <div className="field">
            <label>Epic client ID</label>
            <input
              value={epicClientId}
              onChange={(e) => setEpicClientId(e.target.value)}
              className="mono"
              required
            />
          </div>
          <div className="field">
            <label>
              RSA private key (PEM){" "}
              {hasPrivateKey && !privateKeyPem && (
                <span className="muted">· stored (leave blank to keep)</span>
              )}
            </label>
            <textarea
              value={privateKeyPem}
              onChange={(e) => setPrivateKeyPem(e.target.value)}
              rows={5}
              className="mono"
              placeholder="-----BEGIN PRIVATE KEY-----"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label>JWK Key ID (kid)</label>
            <input value={jwkKeyId} onChange={(e) => setJwkKeyId(e.target.value)} />
          </div>
          <div className="field">
            <label>MRN identifier system (OID)</label>
            <input value={mrnSystem} onChange={(e) => setMrnSystem(e.target.value)} />
          </div>
          <div className="field">
            <label>Scopes</label>
            <input value={scopes} onChange={(e) => setScopes(e.target.value)} />
          </div>
          <div className="btn-row">
            <button className="btn primary" type="submit" disabled={busy}>
              Save connection
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || !enabled}
              onClick={testConnection}
            >
              Test connection
            </button>
          </div>
        </form>

        <div className="card stack">
          <h2>Search &amp; sync patients</h2>
          <div className="field">
            <label>Last name</label>
            <input value={family} onChange={(e) => setFamily(e.target.value)} />
          </div>
          <div className="field">
            <label>First name</label>
            <input value={given} onChange={(e) => setGiven(e.target.value)} />
          </div>
          <div className="field">
            <label>MRN</label>
            <input value={mrn} onChange={(e) => setMrn(e.target.value)} className="mono" />
          </div>
          <div className="field">
            <label>Birth date (YYYY-MM-DD)</label>
            <input value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
          </div>
          <div className="btn-row">
            <button className="btn" type="button" disabled={busy} onClick={searchPatients}>
              Search Epic
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => sync("DRY_RUN")}
            >
              Preview sync
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={busy}
              onClick={() => sync("APPLY")}
            >
              Apply sync
            </button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Epic FHIR provides demographics and insurance; credit-balance dollar amounts still
            come from CSV import or future Resolute financial interfaces.
          </p>
        </div>
      </div>

      {results.length > 0 && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h2>Results</h2>
          <table>
            <thead>
              <tr>
                <th>MRN</th>
                <th>Name</th>
                <th>Account</th>
                <th>Primary plan</th>
                <th>Plan code</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.epicPatientFhirId}>
                  <td className="mono">{r.mrn}</td>
                  <td>
                    {r.firstName} {r.lastName}
                  </td>
                  <td className="mono">{r.accountNumber}</td>
                  <td>{r.primaryInsurance || "—"}</td>
                  <td className="mono">{r.planCode1 || "—"}</td>
                  <td>{r.accountStatus || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </>
  );
}

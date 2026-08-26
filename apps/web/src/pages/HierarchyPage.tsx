import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type Rule = {
  id: string;
  name: string;
  hierarchyRank: number;
  enabled: boolean;
  targetRefundReason: { code: number; name: string };
};

type Pack = {
  id: string;
  name: string;
  description?: string;
  rules: Rule[];
  schedules: Array<{ id: string; name: string; cron: string; enabled: boolean }>;
};

type RunResult = {
  runId: string;
  matchedCount: number;
  appliedCount: number;
  unmappedPrimaryCount?: number;
  matches: Array<{
    accountNumber: string;
    ruleName: string;
    hierarchyRank: number;
    reasonAfterName: string;
    primaryPayerCategory?: string | null;
  }>;
};

export function HierarchyPage() {
  const { clientId } = useAuth();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packId, setPackId] = useState<string>("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scheduleName, setScheduleName] = useState("Nightly apply");
  const [cron, setCron] = useState("0 2 * * *");

  const load = useCallback(() => {
    if (!clientId) return;
    api.get(`/rules/packs/${clientId}`).then((r) => {
      setPacks(r.data);
      if (!packId && r.data[0]) setPackId(r.data[0].id);
    });
  }, [clientId, packId]);

  useEffect(() => {
    load();
  }, [load]);

  const pack = packs.find((p) => p.id === packId);

  async function ensurePack() {
    if (packId || !clientId) return packId;
    const r = await api.post(`/rules/packs/${clientId}`, {
      name: "Default hierarchy",
      description: "Client rule pack",
    });
    setPackId(r.data.id);
    load();
    return r.data.id as string;
  }

  async function move(ruleId: string, dir: -1 | 1) {
    if (!pack) return;
    const ordered = [...pack.rules].sort((a, b) => a.hierarchyRank - b.hierarchyRank);
    const idx = ordered.findIndex((r) => r.id === ruleId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= ordered.length) return;
    [ordered[idx], ordered[j]] = [ordered[j], ordered[idx]];
    await api.put(`/rules/packs/${pack.id}/hierarchy`, {
      orderedRuleIds: ordered.map((r) => r.id),
    });
    load();
  }

  async function run(mode: "DRY_RUN" | "APPLY") {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const id = packId || (await ensurePack());
      const r = await api.post(`/rules/packs/${id}/run`, { mode });
      setResult(r.data);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  async function addSchedule() {
    if (!packId) return;
    await api.post(`/rules/packs/${packId}/schedules`, {
      name: scheduleName,
      cron,
      enabled: true,
    });
    load();
  }

  return (
    <>
      <div className="topbar">
        <h1>Rule hierarchy</h1>
        <div className="btn-row">
          <Link className="btn" to="/rules/new">
            New rule
          </Link>
          <button className="btn" disabled={busy || !packId} onClick={() => run("DRY_RUN")}>
            Dry run
          </button>
          <button
            className="btn primary"
            disabled={busy || !packId}
            onClick={() => run("APPLY")}
          >
            Apply hierarchy
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid cols-2">
        <div className="card stack">
          <div className="field">
            <label>Rule pack</label>
            <select value={packId} onChange={(e) => setPackId(e.target.value)}>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Rules are evaluated from top to bottom. The first matching rule assigns the refund
            reason and stops for that account.
          </p>
          <ul className="hierarchy-list">
            {(pack?.rules ?? [])
              .slice()
              .sort((a, b) => a.hierarchyRank - b.hierarchyRank)
              .map((r) => (
                <li key={r.id} className="hierarchy-item">
                  <div className="rank">#{r.hierarchyRank}</div>
                  <div>
                    <strong>{r.name}</strong>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      → {r.targetRefundReason.code} · {r.targetRefundReason.name}
                      {!r.enabled && " · disabled"}
                    </div>
                  </div>
                  <div className="btn-row">
                    <button className="btn" type="button" onClick={() => move(r.id, -1)}>
                      ↑
                    </button>
                    <button className="btn" type="button" onClick={() => move(r.id, 1)}>
                      ↓
                    </button>
                  </div>
                </li>
              ))}
          </ul>
          {!pack?.rules?.length && (
            <div className="empty">No rules yet. Create one to start the hierarchy.</div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <h2>Schedule</h2>
            <div className="field">
              <label>Name</label>
              <input value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} />
            </div>
            <div className="field">
              <label>Cron</label>
              <input value={cron} onChange={(e) => setCron(e.target.value)} className="mono" />
            </div>
            <button className="btn" type="button" disabled={!packId} onClick={addSchedule}>
              Save schedule
            </button>
            <ul className="muted" style={{ paddingLeft: "1.1rem" }}>
              {(pack?.schedules ?? []).map((s) => (
                <li key={s.id}>
                  {s.name} · <span className="mono">{s.cron}</span> ·{" "}
                  {s.enabled ? "enabled" : "disabled"}
                </li>
              ))}
            </ul>
          </div>

          {result && (
            <div className="card">
              <h2>Last run</h2>
              <p>
                Matched <strong>{result.matchedCount}</strong> · Applied{" "}
                <strong>{result.appliedCount}</strong>
                {typeof result.unmappedPrimaryCount === "number" && (
                  <>
                    {" "}
                    · Unmapped primary plans scanned:{" "}
                    <strong>{result.unmappedPrimaryCount}</strong>
                  </>
                )}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Rank</th>
                    <th>Rule</th>
                    <th>Payer</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((m, i) => (
                    <tr key={i}>
                      <td className="mono">{m.accountNumber}</td>
                      <td>#{m.hierarchyRank}</td>
                      <td>{m.ruleName}</td>
                      <td className="mono">{m.primaryPayerCategory || "—"}</td>
                      <td>{m.reasonAfterName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

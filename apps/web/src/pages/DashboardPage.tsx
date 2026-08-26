import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export function DashboardPage() {
  const { clientId, user } = useAuth();
  const [queues, setQueues] = useState<Array<{ id: string; name: string; openCount: number }>>(
    []
  );
  const [unclassified, setUnclassified] = useState(0);
  const [packs, setPacks] = useState(0);
  const [unmappedPayers, setUnmappedPayers] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    api.get(`/queues/${clientId}`).then((r) => setQueues(r.data));
    api
      .get("/accounts", { params: { clientId, unclassified: "1" } })
      .then((r) => setUnclassified(r.data.length));
    api.get(`/rules/packs/${clientId}`).then((r) => setPacks(r.data.length));
    api
      .get(`/mappings/coverage/${clientId}`)
      .then((r) => setUnmappedPayers(r.data.unmappedPrimary ?? 0))
      .catch(() => setUnmappedPayers(0));
  }, [clientId]);

  const openTotal = queues.reduce((s, q) => s + q.openCount, 0);

  return (
    <>
      <div className="topbar">
        <h1>Dashboard</h1>
        <div className="meta">
          {user?.tenantName} · {user?.role}
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: "1rem" }}>
        <div className="card">
          <div className="stat-label">Unclassified accounts</div>
          <div className="stat">{unclassified}</div>
        </div>
        <div className="card">
          <div className="stat-label">Queued accounts</div>
          <div className="stat">{openTotal}</div>
        </div>
        <div className="card">
          <div className="stat-label">Rule packs</div>
          <div className="stat">{packs}</div>
        </div>
      </div>
      <div className="grid cols-3" style={{ marginBottom: "1rem" }}>
        <div className="card">
          <div className="stat-label">Unmapped primary payers</div>
          <div className="stat">{unmappedPayers}</div>
          <div className="btn-row" style={{ marginTop: "0.5rem" }}>
            <Link className="btn" to="/admin/mappings/payers">
              Fix maps
            </Link>
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Top queues</h2>
          {queues.length === 0 ? (
            <div className="empty">No queues yet. Create rules and run the hierarchy.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {queues.slice(0, 8).map((q) => (
                  <tr key={q.id}>
                    <td>{q.name}</td>
                    <td className="mono">{q.openCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="btn-row" style={{ marginTop: "0.75rem" }}>
            <Link className="btn" to="/queues">
              View queues
            </Link>
            <Link className="btn primary" to="/rules">
              Rule hierarchy
            </Link>
          </div>
        </div>
        <div className="card">
          <h2>Getting started</h2>
          <ol className="muted" style={{ lineHeight: 1.6, paddingLeft: "1.2rem" }}>
            <li>Map payers and account exclusions per client</li>
            <li>Build rules and order them in the hierarchy</li>
            <li>Schedule or run dry-run → apply</li>
            <li>Work resulting reason queues</li>
          </ol>
        </div>
      </div>
    </>
  );
}

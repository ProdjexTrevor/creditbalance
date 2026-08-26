import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

type ReasonRow = {
  id: string;
  code: number;
  name: string;
  assigned: boolean;
  clientLinkActive: boolean;
};

export function AdminClientReasonsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [rows, setRows] = useState<ReasonRow[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [tenantReasons, setTenantReasons] = useState<
    Array<{ id: string; code: number; name: string }>
  >([]);
  const [assignId, setAssignId] = useState("");

  function load() {
    if (!clientId) return;
    api
      .get(`/admin/clients/${clientId}/refund-reasons`)
      .then((r) => setRows(r.data));
    api.get("/admin/refund-reasons").then((r) => {
      setTenantReasons(r.data);
      if (r.data[0]) setAssignId(r.data[0].id);
    });
  }

  useEffect(() => {
    load();
  }, [clientId]);

  async function toggle(r: ReasonRow) {
    if (!clientId) return;
    if (r.assigned) {
      await api.delete(`/admin/clients/${clientId}/refund-reasons/${r.id}`);
    } else {
      await api.post(`/admin/clients/${clientId}/refund-reasons`, {
        refundReasonId: r.id,
      });
    }
    load();
  }

  async function createAndAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setError("");
    try {
      await api.post(`/admin/clients/${clientId}/refund-reasons`, {
        create: { code: Number(code), name },
      });
      setCode("");
      setName("");
      load();
    } catch {
      setError("Could not create reason (code may exist)");
    }
  }

  async function assignExisting(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !assignId) return;
    await api.post(`/admin/clients/${clientId}/refund-reasons`, {
      refundReasonId: assignId,
    });
    load();
  }

  return (
    <>
      <div className="topbar">
        <h1>Admin · Client refund reasons</h1>
        <Link className="btn" to="/admin/clients">
          Back to clients
        </Link>
      </div>

      <p className="muted">
        Enable the reasons this client can use for rule targets and work queues. You can also
        create a new tenant reason and assign it in one step.
      </p>

      <div className="grid cols-2" style={{ marginBottom: "1rem" }}>
        <form className="card" onSubmit={createAndAssign}>
          <h2>Create reason + assign</h2>
          {error && <div className="error">{error}</div>}
          <div className="field">
            <label>Code</label>
            <input
              required
              type="number"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn primary" type="submit">
            Create &amp; assign
          </button>
        </form>

        <form className="card" onSubmit={assignExisting}>
          <h2>Assign existing tenant reason</h2>
          <div className="field">
            <label>Reason</label>
            <select value={assignId} onChange={(e) => setAssignId(e.target.value)}>
              {tenantReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn primary" type="submit">
            Assign to client
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Reason availability</h2>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>On client</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.code}</td>
                <td>{r.name}</td>
                <td>
                  <span className={`badge ${r.assigned ? "ok" : ""}`}>
                    {r.assigned ? "yes" : "no"}
                  </span>
                </td>
                <td>
                  <button type="button" className="btn" onClick={() => toggle(r)}>
                    {r.assigned ? "Remove" : "Add"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

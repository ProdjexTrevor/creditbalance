import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type ClientRow = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  _count: {
    accounts: number;
    userAccess: number;
    refundReasons: number;
    rulePacks: number;
  };
};

export function AdminClientsPage() {
  const { setClientId } = useAuth();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.get("/admin/clients").then((r) => setRows(r.data)).catch(() => setError("Admin access required"));
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/admin/clients", { name, code });
      setName("");
      setCode("");
      load();
    } catch {
      setError("Could not create client (code may already exist)");
    }
  }

  async function toggleActive(c: ClientRow) {
    await api.patch(`/admin/clients/${c.id}`, { active: !c.active });
    load();
  }

  return (
    <>
      <div className="topbar">
        <h1>Admin · Clients</h1>
        <div className="btn-row">
          <Link className="btn" to="/admin/users">
            Users
          </Link>
        </div>
      </div>

      <div className="grid cols-2">
        <form className="card" onSubmit={create}>
          <h2>Add client</h2>
          {error && <div className="error">{error}</div>}
          <div className="field">
            <label>Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Code</label>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. NORTH"
            />
          </div>
          <button className="btn primary" type="submit">
            Create client
          </button>
        </form>

        <div className="card">
          <h2>Clients</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Accounts</th>
                <th>Users</th>
                <th>Reasons</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="mono">{c.code}</td>
                  <td className="mono">{c._count.accounts}</td>
                  <td className="mono">{c._count.userAccess}</td>
                  <td className="mono">{c._count.refundReasons}</td>
                  <td>
                    <span className={`badge ${c.active ? "ok" : ""}`}>
                      {c.active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setClientId(c.id)}
                      >
                        Select
                      </button>
                      <Link className="btn" to={`/admin/clients/${c.id}/reasons`}>
                        Reasons
                      </Link>
                      <Link className="btn" to={`/admin/clients/${c.id}/epic`}>
                        Epic
                      </Link>
                      <Link className="btn" to={`/admin/users?clientId=${c.id}`}>
                        Users
                      </Link>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => toggleActive(c)}
                      >
                        {c.active ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty">No clients yet.</div>}
        </div>
      </div>
    </>
  );
}

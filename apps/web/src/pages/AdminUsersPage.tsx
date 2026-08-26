import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

type Client = { id: string; name: string; code: string };

type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  active: boolean;
  clientAccess: Array<{ client: Client }>;
};

const ROLES = ["TENANT_ADMIN", "CLIENT_ADMIN", "ANALYST", "VIEWER"] as const;

export function AdminUsersPage() {
  const [params] = useSearchParams();
  const preClient = params.get("clientId") || "";

  const [users, setUsers] = useState<UserRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<string>("ANALYST");
  const [clientIds, setClientIds] = useState<string[]>(preClient ? [preClient] : []);

  const [editId, setEditId] = useState<string | null>(null);
  const [editClients, setEditClients] = useState<string[]>([]);
  const [editRole, setEditRole] = useState("ANALYST");
  const [editActive, setEditActive] = useState(true);

  function load() {
    api.get("/admin/users").then((r) => setUsers(r.data)).catch(() => setError("Admin access required"));
    api.get("/admin/clients").then((r) => setClients(r.data));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (preClient) setClientIds([preClient]);
  }, [preClient]);

  const filtered = useMemo(() => {
    if (!preClient) return users;
    return users.filter((u) =>
      u.clientAccess.some((a) => a.client.id === preClient)
    );
  }, [users, preClient]);

  function toggleClient(id: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/admin/users", {
        email,
        password,
        firstName,
        lastName,
        role,
        clientIds,
      });
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      load();
    } catch {
      setError("Could not create user");
    }
  }

  function startEdit(u: UserRow) {
    setEditId(u.id);
    setEditClients(u.clientAccess.map((c) => c.client.id));
    setEditRole(u.role);
    setEditActive(u.active);
  }

  async function saveEdit() {
    if (!editId) return;
    await api.patch(`/admin/users/${editId}`, {
      role: editRole,
      active: editActive,
      clientIds: editClients,
    });
    setEditId(null);
    load();
  }

  return (
    <>
      <div className="topbar">
        <h1>Admin · Users{preClient ? " (client filter)" : ""}</h1>
        <div className="btn-row">
          <Link className="btn" to="/admin/clients">
            Clients
          </Link>
          {preClient && (
            <Link className="btn" to="/admin/users">
              Clear filter
            </Link>
          )}
        </div>
      </div>

      <div className="grid cols-2">
        <form className="card" onSubmit={create}>
          <h2>Add user</h2>
          {error && <div className="error">{error}</div>}
          <div className="grid cols-2">
            <div className="field">
              <label>First name</label>
              <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="field">
              <label>Last name</label>
              <input required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Clients</label>
            <div className="stack" style={{ gap: "0.35rem" }}>
              {clients.map((c) => (
                <label key={c.id} className="muted" style={{ display: "flex", gap: "0.4rem" }}>
                  <input
                    type="checkbox"
                    checked={clientIds.includes(c.id)}
                    onChange={() => toggleClient(c.id, clientIds, setClientIds)}
                  />
                  {c.name} ({c.code})
                </label>
              ))}
            </div>
          </div>
          <button className="btn primary" type="submit">
            Create user
          </button>
        </form>

        <div className="card">
          <h2>Users</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Clients</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="mono" style={{ fontSize: "0.8rem" }}>
                    {u.email}
                  </td>
                  <td>
                    <span className="badge">{u.role}</span>
                  </td>
                  <td className="muted" style={{ fontSize: "0.85rem" }}>
                    {u.clientAccess.map((a) => a.client.code).join(", ") || "—"}
                  </td>
                  <td>
                    <span className={`badge ${u.active ? "ok" : ""}`}>
                      {u.active ? "active" : "off"}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="btn" onClick={() => startEdit(u)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <div className="empty">No users.</div>}

          {editId && (
            <div
              style={{
                marginTop: "1rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border)",
              }}
            >
              <h2>Edit user</h2>
              <div className="field">
                <label>Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <label className="muted" style={{ display: "flex", gap: "0.4rem", marginBottom: "0.75rem" }}>
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />
                Active
              </label>
              <div className="field">
                <label>Clients</label>
                {clients.map((c) => (
                  <label key={c.id} className="muted" style={{ display: "flex", gap: "0.4rem" }}>
                    <input
                      type="checkbox"
                      checked={editClients.includes(c.id)}
                      onChange={() => toggleClient(c.id, editClients, setEditClients)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              <div className="btn-row">
                <button type="button" className="btn primary" onClick={saveEdit}>
                  Save
                </button>
                <button type="button" className="btn" onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

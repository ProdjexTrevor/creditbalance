import { NavLink } from "react-router-dom";
import { useAuth } from "../auth";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";

export function Layout({ children }: { children: ReactNode }) {
  const { user, clients, clientId, setClientId, logout } = useAuth();
  const [allClients, setAllClients] = useState(clients);
  const isTenantAdmin =
    user?.role === "SUPER_ADMIN" || user?.role === "TENANT_ADMIN";
  const isAdmin =
    isTenantAdmin || user?.role === "CLIENT_ADMIN";

  useEffect(() => {
    if (!user) return;
    // Tenant admins see every client in the tenant selector
    if (isTenantAdmin) {
      api
        .get("/clients")
        .then((r) => {
          setAllClients(r.data);
          if (!clientId && r.data[0]) setClientId(r.data[0].id);
        })
        .catch(() => setAllClients(clients));
    } else {
      setAllClients(clients);
    }
  }, [user, isTenantAdmin, clients, clientId, setClientId]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Credit Balance
          <span>{user?.tenantName}</span>
        </div>
        <nav className="nav">
          <NavLink end to="/" className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/queues" className={({ isActive }) => (isActive ? "active" : "")}>
            Work queues
          </NavLink>
          <NavLink to="/accounts" className={({ isActive }) => (isActive ? "active" : "")}>
            Accounts
          </NavLink>
          <NavLink to="/import" className={({ isActive }) => (isActive ? "active" : "")}>
            Import
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
            Profile
          </NavLink>
          <div className="section">Rules engine</div>
          <NavLink to="/rules" className={({ isActive }) => (isActive ? "active" : "")}>
            Hierarchy
          </NavLink>
          <NavLink to="/rules/new" className={({ isActive }) => (isActive ? "active" : "")}>
            New rule
          </NavLink>
          {isAdmin && (
            <>
              <div className="section">Admin</div>
              {isTenantAdmin && (
                <NavLink
                  end
                  to="/admin/clients"
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  Clients
                </NavLink>
              )}
              {isTenantAdmin && (
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  Users
                </NavLink>
              )}
              {clientId && (
                <NavLink
                  to={`/admin/clients/${clientId}/reasons`}
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  Client reasons
                </NavLink>
              )}
              {clientId && (
                <NavLink
                  to={`/admin/clients/${clientId}/epic`}
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  Epic FHIR
                </NavLink>
              )}
              <NavLink
                to="/admin/mappings/payers"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Payer maps
              </NavLink>
              <NavLink
                to="/admin/mappings/accounts"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Account maps
              </NavLink>
            </>
          )}
        </nav>
        <div style={{ marginTop: "auto" }}>
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label>Client</label>
            <select
              value={clientId ?? ""}
              onChange={(e) => setClientId(e.target.value)}
            >
              {allClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn ghost" onClick={logout} style={{ width: "100%" }}>
            Sign out ({user?.email})
          </button>
          <NavLink
            to="/profile"
            className={({ isActive }) => (isActive ? "active" : "")}
            style={{ display: "block", marginTop: "0.35rem", fontSize: "0.85rem" }}
          >
            Account &amp; security
          </NavLink>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

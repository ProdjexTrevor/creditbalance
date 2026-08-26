import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type Account = {
  id: string;
  accountNumber: string;
  patientId: string;
  firstName?: string;
  lastName?: string;
  totalBilledCharges: string;
  patientAccountBalance: string;
  refundReason?: { name: string; code: number } | null;
  location?: string;
  primaryInsurance?: string;
  client?: { id: string; name: string; code: string };
};

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "CLIENT_ADMIN"]);

export function AccountsPage() {
  const { clientId, user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user ? ADMIN_ROLES.has(user.role) : false;
  const isTenantAdmin =
    user?.role === "SUPER_ADMIN" || user?.role === "TENANT_ADMIN";

  const [params, setParams] = useSearchParams();
  const reasonId = params.get("reasonId") || "";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState<"all" | "unclassified" | "reason">(
    reasonId ? "reason" : isAdmin ? "all" : "unclassified"
  );
  const [allClients, setAllClients] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (reasonId) setFilter("reason");
  }, [reasonId]);

  const query = useMemo(() => {
    const base: Record<string, string | number | boolean> = {
      take: isAdmin ? 1000 : 200,
    };
    if (allClients && isTenantAdmin) {
      base.allClients = "1";
    } else {
      base.clientId = clientId ?? "";
    }
    if (filter === "unclassified") base.unclassified = "1";
    if (filter === "reason" && reasonId) base.reasonId = reasonId;
    if (q) base.q = q;
    return base;
  }, [clientId, filter, reasonId, allClients, isTenantAdmin, isAdmin, q]);

  useEffect(() => {
    if (!allClients && !clientId) return;
    api.get("/accounts", { params: query }).then((r) => setAccounts(r.data));
  }, [clientId, query, allClients]);

  function clearReasonFilter() {
    const next = new URLSearchParams(params);
    next.delete("reasonId");
    setParams(next);
    setFilter("all");
  }

  function openAccount(id: string) {
    const qs = new URLSearchParams();
    if (reasonId) qs.set("reasonId", reasonId);
    if (filter === "unclassified") qs.set("unclassified", "1");
    const s = qs.toString();
    navigate(`/accounts/${id}${s ? `?${s}` : ""}`);
  }

  return (
    <>
      <div className="topbar">
        <h1>Accounts{isAdmin ? " (admin)" : ""}</h1>
        <div className="btn-row">
          <input
            placeholder="Search account / name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setQ(search)}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              padding: "0.45rem 0.65rem",
              minWidth: 180,
            }}
          />
          <button type="button" className="btn" onClick={() => setQ(search)}>
            Search
          </button>
          <select
            value={filter}
            onChange={(e) => {
              const v = e.target.value as typeof filter;
              setFilter(v);
              if (v !== "reason") clearReasonFilter();
            }}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              padding: "0.45rem 0.65rem",
            }}
          >
            <option value="all">All accounts</option>
            <option value="unclassified">Unclassified only</option>
            {reasonId && <option value="reason">Current queue reason</option>}
          </select>
          {isTenantAdmin && (
            <label
              className="muted"
              style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={allClients}
                onChange={(e) => setAllClients(e.target.checked)}
              />
              All clients
            </label>
          )}
          {accounts[0] && (
            <button
              type="button"
              className="btn primary"
              onClick={() => openAccount(accounts[0].id)}
            >
              Work first
            </button>
          )}
        </div>
      </div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Showing {accounts.length} account{accounts.length === 1 ? "" : "s"}
          {reasonId ? " for selected queue reason" : ""}. Click a row to open the
          workbench.
        </p>
        <table>
          <thead>
            <tr>
              {allClients && <th>Client</th>}
              <th>Account</th>
              <th>Name</th>
              <th>Balance</th>
              <th>Charges</th>
              <th>Reason</th>
              <th>Insurance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr
                key={a.id}
                className="row-link"
                onClick={() => openAccount(a.id)}
              >
                {allClients && (
                  <td className="muted">{a.client?.name ?? "—"}</td>
                )}
                <td className="mono">{a.accountNumber}</td>
                <td>
                  {[a.firstName, a.lastName].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="mono">
                  {Number(a.patientAccountBalance).toFixed(2)}
                </td>
                <td className="mono">
                  {Number(a.totalBilledCharges).toFixed(2)}
                </td>
                <td>
                  {a.refundReason ? (
                    <span className="badge ok">
                      {a.refundReason.code} · {a.refundReason.name}
                    </span>
                  ) : (
                    <span className="badge">none</span>
                  )}
                </td>
                <td className="muted">{a.primaryInsurance || "—"}</td>
                <td>
                  <Link
                    className="btn"
                    to={`/accounts/${a.id}${
                      reasonId
                        ? `?reasonId=${reasonId}`
                        : filter === "unclassified"
                          ? "?unclassified=1"
                          : ""
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {accounts.length === 0 && (
          <div className="empty">No accounts match.</div>
        )}
      </div>
    </>
  );
}

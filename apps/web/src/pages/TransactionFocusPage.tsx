import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import {
  evaluateAnomalies,
  severityClass,
  type AnnotatedTransaction,
  type AnomalySeverity,
  type WorkbenchTransaction,
} from "../rules/transactionAnomalies";

type Money = string | number;
type Opt = { id: string; code: number; name: string };
type TxnTab = "ehr" | "835" | "overview";

type AccountDetail = {
  id: string;
  clientId: string;
  accountNumber: string;
  patientId: string;
  firstName?: string | null;
  lastName?: string | null;
  patientAccountBalance: Money;
  totalBilledCharges: Money;
  primaryInsurance?: string | null;
  refundReasonId?: string | null;
  refundStatusId?: string | null;
  refundReason?: { id: string; code: number; name: string } | null;
  refundStatus?: { id: string; code: number; name: string } | null;
  client?: { id: string; name: string; code: string };
  transactions: WorkbenchTransaction[];
  notes: Array<{ id: string; body: string; createdAt: string }>;
};

function money(v: Money | null | undefined) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateLabel(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString();
}

function severityBadge(sev: AnomalySeverity) {
  if (sev === "error") return "badge badge-error";
  if (sev === "warning") return "badge badge-warning";
  return "badge badge-info";
}

function formatIssueBlock(
  selected: AnnotatedTransaction[],
  reasonLabel: string,
  analystNote: string
): string {
  const lines: string[] = [];
  lines.push("Issue transactions marked for review:");
  if (reasonLabel) lines.push(`Refund reason: ${reasonLabel}`);
  lines.push("");
  for (const t of selected) {
    const src = String(t.source || "EHR").replace("ERA_", "");
    const flags = t.anomalies.map((a) => a.message).join("; ");
    lines.push(
      `• [${src}] ${dateLabel(t.postingDate)} | ${t.transactionType || "?"} | ${money(t.postingAmount)} | ${t.transactionDescription || "—"}` +
        (flags ? ` | FLAGS: ${flags}` : "")
    );
    if (t.planCode) {
      lines.push(`  Plan: ${t.planCode}${t.planName ? ` · ${t.planName}` : ""}`);
    }
  }
  if (analystNote.trim()) {
    lines.push("");
    lines.push("Analyst notes:");
    lines.push(analystNote.trim());
  }
  return lines.join("\n");
}

export function TransactionFocusPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queueQs = params.toString() ? `?${params.toString()}` : "";

  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [reasons, setReasons] = useState<Opt[]>([]);
  const [statuses, setStatuses] = useState<Opt[]>([]);
  const [reasonId, setReasonId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [tab, setTab] = useState<TxnTab>("overview");
  const [issueIds, setIssueIds] = useState<Set<string>>(new Set());
  const [analystNote, setAnalystNote] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const r = await api.get(`/accounts/${id}`);
      const a = r.data as AccountDetail;
      setAccount(a);
      setReasonId(a.refundReasonId ?? "");
      setStatusId(a.refundStatusId ?? "");

      // Pre-mark error anomalies as issue candidates
      const overview = evaluateAnomalies(a.transactions || [], "overview");
      const pre = new Set(
        overview.filter((t) => t.maxSeverity === "error").map((t) => t.id)
      );
      setIssueIds(pre);
    } catch {
      setError("Could not load account.");
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!account?.clientId) return;
    api
      .get("/catalog/refund-reasons", { params: { clientId: account.clientId } })
      .then((r) => setReasons(r.data));
    api.get("/catalog/refund-statuses").then((r) => setStatuses(r.data));
  }, [account?.clientId]);

  const ehr = useMemo(
    () =>
      (account?.transactions || []).filter(
        (t) => !t.source || String(t.source).toUpperCase() === "EHR"
      ),
    [account]
  );
  const era = useMemo(
    () =>
      (account?.transactions || []).filter((t) => {
        const s = String(t.source || "").toUpperCase();
        return s === "ERA_835" || s === "835";
      }),
    [account]
  );

  const overviewRows = useMemo(
    () => evaluateAnomalies(account?.transactions || [], "overview"),
    [account]
  );
  const ehrRows = useMemo(() => evaluateAnomalies(ehr, "ehr"), [ehr]);
  const eraRows = useMemo(() => evaluateAnomalies(era, "835"), [era]);

  const activeRows =
    tab === "ehr" ? ehrRows : tab === "835" ? eraRows : overviewRows;

  const selectedRows = useMemo(
    () => overviewRows.filter((t) => issueIds.has(t.id)),
    [overviewRows, issueIds]
  );

  const reasonLabel = useMemo(() => {
    const r = reasons.find((x) => x.id === reasonId);
    return r ? `${r.code} · ${r.name}` : "";
  }, [reasons, reasonId]);

  const notePreview = useMemo(
    () => formatIssueBlock(selectedRows, reasonLabel, analystNote),
    [selectedRows, reasonLabel, analystNote]
  );

  function toggleIssue(txnId: string) {
    setIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(txnId)) next.delete(txnId);
      else next.add(txnId);
      return next;
    });
  }

  function markAllVisibleAnomalies() {
    setIssueIds((prev) => {
      const next = new Set(prev);
      for (const t of activeRows) {
        if (t.maxSeverity === "error" || t.maxSeverity === "warning") {
          next.add(t.id);
        }
      }
      return next;
    });
  }

  function clearIssues() {
    setIssueIds(new Set());
  }

  async function saveReasonOnly() {
    if (!account) return;
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      const r = await api.patch(`/accounts/${account.id}`, {
        refundReasonId: reasonId || null,
        refundStatusId: statusId || null,
        note: "Reason/status updated from focused transaction view",
      });
      setAccount((prev) =>
        prev
          ? {
              ...prev,
              refundReasonId: r.data.refundReasonId,
              refundStatusId: r.data.refundStatusId,
              refundReason: r.data.refundReason,
              refundStatus: r.data.refundStatus,
            }
          : prev
      );
      setOkMsg("Reason and status saved.");
    } catch {
      setError("Could not save reason/status.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReasonAndNote() {
    if (!account) return;
    if (selectedRows.length === 0 && !analystNote.trim()) {
      setError("Mark at least one issue transaction or add a note.");
      return;
    }
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      await api.patch(`/accounts/${account.id}`, {
        refundReasonId: reasonId || null,
        refundStatusId: statusId || null,
        note: "Reason saved with issue transactions",
      });
      await api.post(`/accounts/${account.id}/notes`, {
        body: notePreview,
      });
      setOkMsg(
        `Saved reason + note with ${selectedRows.length} issue transaction(s).`
      );
      setAnalystNote("");
      await load();
    } catch {
      setError("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="focus-shell">
        <div className="center">Loading focused transactions…</div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="focus-shell">
        <div className="card" style={{ margin: "2rem auto", maxWidth: 480 }}>
          <p className="error">{error || "Account not found"}</p>
          <Link className="btn" to="/accounts">
            Back
          </Link>
        </div>
      </div>
    );
  }

  const name =
    [account.firstName, account.lastName].filter(Boolean).join(" ") || "—";

  return (
    <div className="focus-shell">
      <header className="focus-top">
        <div className="focus-top-left">
          <button
            type="button"
            className="btn"
            onClick={() => navigate(`/accounts/${account.id}${queueQs}`)}
          >
            ← Account
          </button>
          <div>
            <div className="focus-title mono">{account.accountNumber}</div>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              {name}
              {account.client ? ` · ${account.client.name}` : ""}
              {" · "}
              Balance {money(account.patientAccountBalance)}
              {" · "}
              Charges {money(account.totalBilledCharges)}
            </div>
          </div>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={markAllVisibleAnomalies}>
            Mark flagged on tab
          </button>
          <button type="button" className="btn" onClick={clearIssues}>
            Clear marks
          </button>
          <span className="badge badge-error">
            {issueIds.size} issue txn{issueIds.size === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {(error || okMsg) && (
        <div className="focus-banner">
          {error && <span className="error">{error}</span>}
          {okMsg && <span className="ok-msg">{okMsg}</span>}
        </div>
      )}

      <div className="focus-body">
        <main className="focus-main">
          <div className="txn-tabs" role="tablist">
            {(
              [
                ["ehr", "EHR Transactions", ehr.length],
                ["835", "835 Transactions", era.length],
                ["overview", "Transaction Overview", account.transactions.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                className={tab === key ? "txn-tab active" : "txn-tab"}
                onClick={() => setTab(key)}
              >
                {label}
                <span className="txn-tab-count">{count}</span>
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <p className="muted txn-legend">
              Click rows or the checkbox to mark <strong>issue transactions</strong>. Red rows
              failed anomaly rules. Marks are pulled into the note from the side panel.
            </p>
          )}

          <div className="table-scroll focus-table">
            {!activeRows.length ? (
              <div className="empty">No transactions in this view.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th className="col-check">Issue</th>
                    <th>Date</th>
                    {tab === "overview" && <th>Source</th>}
                    <th>Type</th>
                    <th>Description</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Running</th>
                    {tab === "overview" && <th>Flags</th>}
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((t) => {
                    const marked = issueIds.has(t.id);
                    return (
                      <tr
                        key={t.id}
                        className={[
                          severityClass(t.maxSeverity),
                          marked ? "txn-row-issue" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => toggleIssue(t.id)}
                      >
                        <td className="col-check" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={marked}
                            onChange={() => toggleIssue(t.id)}
                            aria-label="Mark as issue transaction"
                          />
                        </td>
                        <td className="mono">{dateLabel(t.postingDate)}</td>
                        {tab === "overview" && (
                          <td>
                            <span className="badge">
                              {String(t.source || "EHR").replace("ERA_", "")}
                            </span>
                          </td>
                        )}
                        <td>{t.transactionType || "—"}</td>
                        <td>
                          {t.transactionDescription || "—"}
                          {t.claimAdjustmentGroupCode ? (
                            <span className="badge" style={{ marginLeft: 6 }}>
                              {t.claimAdjustmentGroupCode}
                            </span>
                          ) : null}
                        </td>
                        <td className="muted">
                          {t.planCode || "—"}
                          {t.planName ? ` · ${t.planName}` : ""}
                        </td>
                        <td className="mono">{money(t.postingAmount)}</td>
                        <td className="mono">{money(t.runningTotal)}</td>
                        {tab === "overview" && (
                          <td>
                            {t.anomalies.length === 0 ? (
                              <span className="muted">—</span>
                            ) : (
                              <div className="anomaly-flags">
                                {t.anomalies.map((a) => (
                                  <span
                                    key={a.ruleId + a.message}
                                    className={severityBadge(a.severity)}
                                    title={a.message}
                                  >
                                    {a.message}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>

        <aside className="focus-side">
          <div className="focus-side-inner">
            <h2>Disposition</h2>
            <div className="field">
              <label>Refund reason</label>
              <select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
                <option value="">— Unclassified —</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                <option value="">— None —</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={saveReasonOnly}
              style={{ width: "100%", marginBottom: "0.75rem" }}
            >
              Save reason / status
            </button>

            <h2>Issue transactions</h2>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              Marked rows are included when you save the note.
            </p>
            {selectedRows.length === 0 ? (
              <div className="empty" style={{ padding: "0.75rem 0" }}>
                None marked yet.
              </div>
            ) : (
              <ul className="issue-list">
                {selectedRows.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="issue-remove"
                      onClick={() => toggleIssue(t.id)}
                      title="Unmark"
                    >
                      ×
                    </button>
                    <div className="mono" style={{ fontSize: "0.8rem" }}>
                      {dateLabel(t.postingDate)} · {money(t.postingAmount)}
                    </div>
                    <div style={{ fontSize: "0.85rem" }}>
                      {t.transactionType} — {t.transactionDescription}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="field" style={{ marginTop: "0.75rem" }}>
              <label>Additional note</label>
              <textarea
                rows={4}
                value={analystNote}
                onChange={(e) => setAnalystNote(e.target.value)}
                placeholder="Why these transactions are the issue…"
              />
            </div>

            <div className="field">
              <label>Note preview</label>
              <pre className="note-preview">{notePreview || "—"}</pre>
            </div>

            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={saveReasonAndNote}
              style={{ width: "100%" }}
            >
              Save reason + note with issues
            </button>

            {account.notes?.[0] && (
              <div style={{ marginTop: "1rem" }}>
                <h2>Latest note</h2>
                <pre className="note-preview muted">
                  {account.notes[0].body}
                </pre>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

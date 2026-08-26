import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import {
  evaluateAnomalies,
  severityClass,
  type AnnotatedTransaction,
  type AnomalySeverity,
  type WorkbenchTransaction,
} from "../rules/transactionAnomalies";

type Money = string | number;

type Txn = WorkbenchTransaction;

type Detail = {
  id: string;
  clientId: string;
  accountNumber: string;
  patientId: string;
  firstName?: string | null;
  lastName?: string | null;
  medicalRecordNumber?: string | null;
  location?: string | null;
  patientType?: string | null;
  admitDate?: string | null;
  dischargeDate?: string | null;
  primaryInsurance?: string | null;
  secondaryInsurance?: string | null;
  tertiaryInsurance?: string | null;
  planCode1?: string | null;
  planCode2?: string | null;
  planCode3?: string | null;
  totalBilledCharges: Money;
  patientAccountBalance: Money;
  totalNetPmts: Money;
  netAdminOtherAdj: Money;
  netContractualAdj: Money;
  netPgp: Money;
  eraCharges: Money;
  eraTotal: Money;
  ptRepEra: Money;
  netSecondaryPayment: Money;
  charityWo: Money;
  refundReasonId?: string | null;
  refundStatusId?: string | null;
  refundReason?: { id: string; code: number; name: string } | null;
  refundStatus?: { id: string; code: number; name: string } | null;
  client?: { id: string; name: string; code: string };
  notes: Array<{ id: string; body: string; createdAt: string; userId?: string | null }>;
  history: Array<{
    id: string;
    source: string;
    note?: string | null;
    createdAt: string;
    refundReasonId?: string | null;
    refundStatusId?: string | null;
    adjustmentAmount?: Money | null;
  }>;
  transactions: Txn[];
};

type Opt = { id: string; code: number; name: string };
type TxnTab = "ehr" | "835" | "overview";

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="wb-field">
      <span className="wb-label">{label}</span>
      <span className="wb-value">{children}</span>
    </div>
  );
}

function severityBadge(sev: AnomalySeverity) {
  if (sev === "error") return "badge badge-error";
  if (sev === "warning") return "badge badge-warning";
  return "badge badge-info";
}

function TransactionTable({
  rows,
  showSource,
  showAnomalies,
}: {
  rows: AnnotatedTransaction[];
  showSource?: boolean;
  showAnomalies?: boolean;
}) {
  if (!rows.length) {
    return <div className="empty">No transactions in this view.</div>;
  }
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {showSource && <th>Source</th>}
            <th>Type</th>
            <th>Description</th>
            <th>Plan</th>
            <th>Amount</th>
            <th>Running</th>
            {showAnomalies && <th>Flags</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className={severityClass(t.maxSeverity)}>
              <td className="mono">{dateLabel(t.postingDate)}</td>
              {showSource && (
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
              {showAnomalies && (
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionPanels({
  transactions,
  accountId,
  queueQuery,
}: {
  transactions: Txn[];
  accountId: string;
  queueQuery: string;
}) {
  const [tab, setTab] = useState<TxnTab>("overview");

  const ehr = useMemo(
    () =>
      transactions.filter(
        (t) => !t.source || String(t.source).toUpperCase() === "EHR"
      ),
    [transactions]
  );
  const era = useMemo(
    () =>
      transactions.filter((t) => {
        const s = String(t.source || "").toUpperCase();
        return s === "ERA_835" || s === "835";
      }),
    [transactions]
  );

  const overviewRows = useMemo(
    () => evaluateAnomalies(transactions, "overview"),
    [transactions]
  );
  const ehrRows = useMemo(() => evaluateAnomalies(ehr, "ehr"), [ehr]);
  const eraRows = useMemo(() => evaluateAnomalies(era, "835"), [era]);

  const errorCount = overviewRows.filter((r) => r.maxSeverity === "error").length;
  const warnCount = overviewRows.filter((r) => r.maxSeverity === "warning").length;

  return (
    <div className="card">
      <div className="txn-tabs-header">
        <h2 style={{ margin: 0 }}>Transactions</h2>
        <div className="btn-row">
          {errorCount + warnCount > 0 && (
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {errorCount > 0 && (
                <span className="badge badge-error">{errorCount} errors</span>
              )}{" "}
              {warnCount > 0 && (
                <span className="badge badge-warning">{warnCount} warnings</span>
              )}
            </span>
          )}
          <Link
            className="btn primary"
            to={`/accounts/${accountId}/transactions${queueQuery}`}
          >
            Focus transactions
          </Link>
        </div>
      </div>

      <div className="txn-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === "ehr" ? "txn-tab active" : "txn-tab"}
          onClick={() => setTab("ehr")}
        >
          EHR Transactions
          <span className="txn-tab-count">{ehr.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "835" ? "txn-tab active" : "txn-tab"}
          onClick={() => setTab("835")}
        >
          835 Transactions
          <span className="txn-tab-count">{era.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "overview" ? "txn-tab active" : "txn-tab"}
          onClick={() => setTab("overview")}
        >
          Transaction Overview
          <span className="txn-tab-count">{transactions.length}</span>
        </button>
      </div>

      {tab === "overview" && (
        <p className="muted txn-legend">
          Rows highlighted in <span className="swatch error">red</span> failed
          anomaly rules (negative running total, payment w/o charge, adjustment
          w/o credit, etc.).{" "}
          <span className="swatch warning">Amber</span> = warnings. Rules live
          in <code>rules/TRANSACTION_ANOMALIES.md</code>.
        </p>
      )}

      {tab === "ehr" && (
        <TransactionTable rows={ehrRows} showAnomalies={false} />
      )}
      {tab === "835" && (
        <TransactionTable rows={eraRows} showAnomalies={false} />
      )}
      {tab === "overview" && (
        <TransactionTable rows={overviewRows} showSource showAnomalies />
      )}
    </div>
  );
}

export function AccountWorkbenchPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { clientId } = useAuth();

  const queueReasonId = params.get("reasonId") || "";
  const queueUnclassified = params.get("unclassified") === "1";

  const [account, setAccount] = useState<Detail | null>(null);
  const [reasons, setReasons] = useState<Opt[]>([]);
  const [statuses, setStatuses] = useState<Opt[]>([]);
  const [reasonId, setReasonId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const queueQuery = useMemo(() => {
    const q = new URLSearchParams();
    if (queueReasonId) q.set("reasonId", queueReasonId);
    if (queueUnclassified) q.set("unclassified", "1");
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [queueReasonId, queueUnclassified]);

  const load = useCallback(
    async (accountId: string) => {
      setLoading(true);
      setError("");
      try {
        const r = await api.get(`/accounts/${accountId}`);
        const a = r.data as Detail;
        setAccount(a);
        setReasonId(a.refundReasonId ?? "");
        setStatusId(a.refundStatusId ?? "");
      } catch {
        setError("Account not found or access denied.");
        setAccount(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (id) load(id);
  }, [id, load]);

  useEffect(() => {
    const cid = account?.clientId || clientId;
    if (!cid) return;
    api
      .get("/catalog/refund-reasons", { params: { clientId: cid } })
      .then((r) => setReasons(r.data));
    api.get("/catalog/refund-statuses").then((r) => setStatuses(r.data));
  }, [account?.clientId, clientId]);

  async function saveUpdates() {
    if (!account) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.patch(`/accounts/${account.id}`, {
        refundReasonId: reasonId || null,
        refundStatusId: statusId || null,
        note: saveNote || "Workbench save",
      });
      setAccount(r.data);
      setSaveNote("");
    } catch {
      setError("Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!account || !noteBody.trim()) return;
    setBusy(true);
    try {
      await api.post(`/accounts/${account.id}/notes`, { body: noteBody.trim() });
      setNoteBody("");
      await load(account.id);
    } catch {
      setError("Could not add note.");
    } finally {
      setBusy(false);
    }
  }

  async function complete(goNext: boolean) {
    if (!account) return;
    setBusy(true);
    setError("");
    try {
      // save reason/status first if changed
      await api.patch(`/accounts/${account.id}`, {
        refundReasonId: reasonId || null,
        refundStatusId: statusId || null,
        note: "Pre-complete save",
      });

      const r = await api.post(`/accounts/${account.id}/complete`, {
        markCompleted: true,
        goNext,
        queueReasonId: queueReasonId || account.refundReasonId || reasonId || null,
        queueUnclassified,
        note: "Completed from workbench",
      });

      if (goNext && r.data.next?.id) {
        navigate(`/accounts/${r.data.next.id}${queueQuery}`);
      } else if (goNext && !r.data.next) {
        setAccount(r.data.account);
        setError("");
        navigate(`/accounts${queueQuery || (queueReasonId ? `?reasonId=${queueReasonId}` : "")}`);
      } else {
        setAccount(r.data.account);
        setStatusId(r.data.account.refundStatusId ?? "");
      }
    } catch {
      setError("Could not complete account.");
    } finally {
      setBusy(false);
    }
  }

  async function goNextOnly() {
    if (!account) return;
    setBusy(true);
    try {
      const r = await api.get("/accounts/queue/next", {
        params: {
          clientId: account.clientId,
          afterId: account.id,
          ...(queueReasonId ? { reasonId: queueReasonId } : {}),
          ...(queueUnclassified ? { unclassified: "1" } : {}),
        },
      });
      if (r.data.next?.id) {
        navigate(`/accounts/${r.data.next.id}${queueQuery}`);
      } else {
        setError("No more accounts in this queue.");
      }
    } catch {
      setError("Could not load next account.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="center">Loading account…</div>;
  if (!account) {
    return (
      <div className="card">
        <p className="error">{error || "Not found"}</p>
        <Link className="btn" to="/accounts">
          Back to accounts
        </Link>
      </div>
    );
  }

  const name =
    [account.firstName, account.lastName].filter(Boolean).join(" ") || "—";

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="mono" style={{ marginBottom: 4 }}>
            {account.accountNumber}
          </h1>
          <div className="muted" style={{ fontSize: "0.9rem" }}>
            {name}
            {account.client ? ` · ${account.client.name}` : ""}
            {account.location ? ` · ${account.location}` : ""}
          </div>
        </div>
        <div className="btn-row">
          <Link
            className="btn"
            to={
              queueReasonId
                ? `/accounts?reasonId=${queueReasonId}`
                : queueUnclassified
                  ? "/accounts"
                  : "/accounts"
            }
          >
            Queue list
          </Link>
          <Link
            className="btn primary"
            to={`/accounts/${account.id}/transactions${queueQuery}`}
          >
            Focus transactions
          </Link>
          <button type="button" className="btn" disabled={busy} onClick={goNextOnly}>
            Skip → Next
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => complete(false)}
          >
            Complete
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => complete(true)}
          >
            Complete → Next
          </button>
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: "0.75rem" }}>{error}</div>}

      <div className="wb-layout">
        <div className="stack">
          <div className="card">
            <h2>Account summary</h2>
            <div className="wb-grid">
              <Field label="Patient ID">{account.patientId}</Field>
              <Field label="MRN">{account.medicalRecordNumber || "—"}</Field>
              <Field label="Patient type">{account.patientType || "—"}</Field>
              <Field label="Admit">{dateLabel(account.admitDate)}</Field>
              <Field label="Discharge">{dateLabel(account.dischargeDate)}</Field>
              <Field label="Location">{account.location || "—"}</Field>
            </div>
          </div>

          <div className="card">
            <h2>Balances</h2>
            <div className="wb-grid balances">
              <Field label="Account balance">
                <strong className="mono">{money(account.patientAccountBalance)}</strong>
              </Field>
              <Field label="Total charges">
                <span className="mono">{money(account.totalBilledCharges)}</span>
              </Field>
              <Field label="Net payments">
                <span className="mono">{money(account.totalNetPmts)}</span>
              </Field>
              <Field label="Net contractual">
                <span className="mono">{money(account.netContractualAdj)}</span>
              </Field>
              <Field label="Net admin/other">
                <span className="mono">{money(account.netAdminOtherAdj)}</span>
              </Field>
              <Field label="Patient payments (netpgp)">
                <span className="mono">{money(account.netPgp)}</span>
              </Field>
              <Field label="ERA charges">
                <span className="mono">{money(account.eraCharges)}</span>
              </Field>
              <Field label="ERA total">
                <span className="mono">{money(account.eraTotal)}</span>
              </Field>
              <Field label="Pt liability ERA">
                <span className="mono">{money(account.ptRepEra)}</span>
              </Field>
              <Field label="Charity WO">
                <span className="mono">{money(account.charityWo)}</span>
              </Field>
            </div>
          </div>

          <div className="card">
            <h2>Insurance</h2>
            <div className="wb-grid">
              <Field label="Primary">
                {account.primaryInsurance || "—"}
                {account.planCode1 ? (
                  <span className="badge" style={{ marginLeft: 6 }}>
                    {account.planCode1}
                  </span>
                ) : null}
              </Field>
              <Field label="Secondary">
                {account.secondaryInsurance || "—"}
                {account.planCode2 ? (
                  <span className="badge" style={{ marginLeft: 6 }}>
                    {account.planCode2}
                  </span>
                ) : null}
              </Field>
              <Field label="Tertiary">
                {account.tertiaryInsurance || "—"}
                {account.planCode3 ? (
                  <span className="badge" style={{ marginLeft: 6 }}>
                    {account.planCode3}
                  </span>
                ) : null}
              </Field>
            </div>
          </div>

          <TransactionPanels
            transactions={account.transactions || []}
            accountId={account.id}
            queueQuery={queueQuery}
          />
        </div>

        <div className="stack">
          <div className="card">
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
            <div className="field">
              <label>Change note (optional)</label>
              <input
                value={saveNote}
                onChange={(e) => setSaveNote(e.target.value)}
                placeholder="Reason for update"
              />
            </div>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={saveUpdates}
              style={{ width: "100%" }}
            >
              Save reason / status
            </button>
            <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 0 }}>
              Current:{" "}
              {account.refundReason
                ? `${account.refundReason.code} · ${account.refundReason.name}`
                : "no reason"}
              {" · "}
              {account.refundStatus?.name ?? "no status"}
            </p>
          </div>

          <div className="card">
            <h2>Notes</h2>
            <div className="field">
              <label>Add note</label>
              <textarea
                rows={3}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Analyst note…"
              />
            </div>
            <button
              type="button"
              className="btn"
              disabled={busy || !noteBody.trim()}
              onClick={addNote}
            >
              Add note
            </button>
            <ul className="note-list">
              {account.notes.map((n) => (
                <li key={n.id}>
                  <div className="muted" style={{ fontSize: "0.75rem" }}>
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                  <div>{n.body}</div>
                </li>
              ))}
            </ul>
            {!account.notes.length && (
              <div className="empty" style={{ padding: "0.5rem 0" }}>
                No notes yet.
              </div>
            )}
          </div>

          <div className="card">
            <h2>History</h2>
            {account.history.length === 0 ? (
              <div className="empty">No history.</div>
            ) : (
              <ul className="note-list">
                {account.history.map((h) => (
                  <li key={h.id}>
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {new Date(h.createdAt).toLocaleString()} · {h.source}
                      {h.adjustmentAmount != null
                        ? ` · adj ${money(h.adjustmentAmount)}`
                        : ""}
                    </div>
                    <div>{h.note || "Update"}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

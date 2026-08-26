import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

type MapRow = {
  id: string;
  sourcePlanCode: string | null;
  sourcePlanName: string | null;
  notes: string | null;
  active: boolean;
  payerCategory: { id: string; name: string; code: string };
};

type Cat = { id: string; name: string; code: string };

type Coverage = {
  totalAccounts: number;
  mappedPrimary: number;
  unmappedPrimary: number;
  noPrimaryPlan?: number;
  noPlan?: number;
  unmappedSamples: Array<{
    accountNumber: string;
    planCode1: string | null;
    primaryInsurance: string | null;
  }>;
};

export function PayerMapsPage() {
  const { clientId } = useAuth();
  const [rows, setRows] = useState<MapRow[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [catId, setCatId] = useState("");

  function load() {
    if (!clientId) return;
    api.get(`/mappings/payers/${clientId}`).then((r) => setRows(r.data));
    api.get(`/mappings/coverage/${clientId}`).then((r) => setCoverage(r.data));
  }

  useEffect(() => {
    api.get("/catalog/payer-categories").then((r) => {
      setCats(r.data);
      if (r.data[0]) setCatId(r.data[0].id);
    });
  }, []);

  useEffect(() => {
    load();
  }, [clientId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    await api.post(`/mappings/payers/${clientId}`, {
      sourcePlanCode: code || null,
      sourcePlanName: name || null,
      payerCategoryId: catId,
    });
    setCode("");
    setName("");
    load();
  }

  async function remove(id: string) {
    if (!clientId) return;
    await api.delete(`/mappings/payers/${clientId}/${id}`);
    load();
  }

  return (
    <>
      <div className="topbar">
        <h1>Payer mapping</h1>
      </div>
      <p className="muted">
        Map source plan codes/names to tenant payer categories (per client). Hierarchy rules can
        match on mapped categories (<span className="mono">primaryPayerCategory</span>,{" "}
        <span className="mono">anyPayerCategory</span>) without hard-coding plan codes.
      </p>
      {coverage && (
        <div className="grid cols-3" style={{ marginBottom: "1rem" }}>
          <div className="card">
            <div className="stat-label">Mapped primary</div>
            <div className="stat">{coverage.mappedPrimary}</div>
          </div>
          <div className="card">
            <div className="stat-label">Unmapped primary</div>
            <div className="stat">{coverage.unmappedPrimary}</div>
          </div>
          <div className="card">
            <div className="stat-label">No plan on account</div>
            <div className="stat">{coverage.noPrimaryPlan ?? coverage.noPlan ?? 0}</div>
          </div>
        </div>
      )}
      {coverage && coverage.unmappedSamples.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2>Unmapped sample accounts</h2>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Plan code</th>
                <th>Primary insurance</th>
              </tr>
            </thead>
            <tbody>
              {coverage.unmappedSamples.map((s) => (
                <tr key={s.accountNumber}>
                  <td className="mono">{s.accountNumber}</td>
                  <td className="mono">{s.planCode1 || "—"}</td>
                  <td>{s.primaryInsurance || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid cols-2">
        <form className="card" onSubmit={add}>
          <h2>Add mapping</h2>
          <div className="field">
            <label>Source plan code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="field">
            <label>Source plan name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={catId} onChange={(e) => setCatId(e.target.value)}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn primary" type="submit">
            Save
          </button>
        </form>
        <div className="card">
          <h2>Current maps</h2>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.sourcePlanCode || "—"}</td>
                  <td>{r.sourcePlanName || "—"}</td>
                  <td>
                    <span className="badge">{r.payerCategory.name}</span>
                  </td>
                  <td>
                    <button className="btn danger" type="button" onClick={() => remove(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty">No payer maps yet.</div>}
        </div>
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

type MapRow = {
  id: string;
  sourceAccountKey: string;
  tag: string | null;
  excluded: boolean;
  notes: string | null;
};

export function AccountMapsPage() {
  const { clientId } = useAuth();
  const [rows, setRows] = useState<MapRow[]>([]);
  const [key, setKey] = useState("");
  const [tag, setTag] = useState("");
  const [excluded, setExcluded] = useState(false);
  const [notes, setNotes] = useState("");

  function load() {
    if (!clientId) return;
    api.get(`/mappings/accounts/${clientId}`).then((r) => setRows(r.data));
  }

  useEffect(() => {
    load();
  }, [clientId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    await api.post(`/mappings/accounts/${clientId}`, {
      sourceAccountKey: key,
      tag: tag || null,
      excluded,
      notes: notes || null,
    });
    setKey("");
    setTag("");
    setNotes("");
    setExcluded(false);
    load();
  }

  async function remove(id: string) {
    if (!clientId) return;
    await api.delete(`/mappings/accounts/${clientId}/${id}`);
    load();
  }

  return (
    <>
      <div className="topbar">
        <h1>Account mapping</h1>
      </div>
      <p className="muted">
        Per-client account keys, tags, and exclusions (skipped by the hierarchy engine).
      </p>
      <div className="grid cols-2">
        <form className="card" onSubmit={add}>
          <h2>Add mapping</h2>
          <div className="field">
            <label>Source account key</label>
            <input required value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
          <div className="field">
            <label>Tag</label>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. LTC" />
          </div>
          <div className="field">
            <label>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="muted" style={{ display: "flex", gap: "0.4rem", marginBottom: "0.75rem" }}>
            <input
              type="checkbox"
              checked={excluded}
              onChange={(e) => setExcluded(e.target.checked)}
            />
            Exclude from rule engine
          </label>
          <button className="btn primary" type="submit">
            Save
          </button>
        </form>
        <div className="card">
          <h2>Current maps</h2>
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Tag</th>
                <th>Excluded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.sourceAccountKey}</td>
                  <td>{r.tag || "—"}</td>
                  <td>{r.excluded ? "yes" : "no"}</td>
                  <td>
                    <button className="btn danger" type="button" onClick={() => remove(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty">No account maps yet.</div>}
        </div>
      </div>
    </>
  );
}

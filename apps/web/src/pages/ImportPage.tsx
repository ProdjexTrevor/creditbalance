import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

type Batch = {
  id: string;
  fileName: string | null;
  mode: string;
  status: string;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  createdAt: string;
};

type ImportResult = {
  importBatchId?: string;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: Array<{ row: number; message: string; accountNumber?: string }>;
  sample: Array<{
    action: string;
    patientId?: string;
    accountNumber?: string;
    message?: string;
  }>;
  columnMapping?: Record<string, string>;
};

type FieldDef = {
  key: string;
  label: string;
  type: string;
  identity?: boolean;
  group: string;
};

type Analysis = {
  headers: string[];
  rowCount: number;
  sampleRows: Array<Record<string, string>>;
  suggestedMapping: Record<string, string>;
  fields: FieldDef[];
};

const GROUP_LABEL: Record<string, string> = {
  identity: "Identity (required)",
  demographics: "Demographics",
  payer: "Payer / plan",
  financial: "Financial",
  dates: "Dates",
};

export function ImportPage() {
  const { clientId } = useAuth();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  /** target field → source header */
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [analyzeBusy, setAnalyzeBusy] = useState(false);

  function loadBatches() {
    if (!clientId) return;
    api.get(`/imports/${clientId}/batches`).then((r) => setBatches(r.data));
  }

  useEffect(() => {
    loadBatches();
  }, [clientId]);

  const runAnalyze = useCallback(async (csvText: string) => {
    if (!csvText.trim()) {
      setAnalysis(null);
      setMapping({});
      return;
    }
    setAnalyzeBusy(true);
    setError("");
    try {
      const r = await api.post("/imports/accounts/analyze", { csvText });
      const data = r.data as Analysis;
      setAnalysis(data);
      setMapping({ ...data.suggestedMapping });
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || (e instanceof Error ? e.message : "Could not analyze CSV");
      setError(typeof msg === "string" ? msg : "Could not analyze CSV");
      setAnalysis(null);
    } finally {
      setAnalyzeBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!text.trim()) {
      setAnalysis(null);
      setMapping({});
      return;
    }
    const t = setTimeout(() => {
      void runAnalyze(text);
    }, 400);
    return () => clearTimeout(t);
  }, [text, runAnalyze]);

  async function onFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const t = await file.text();
    setText(t);
    setResult(null);
  }

  function setFieldSource(fieldKey: string, sourceHeader: string) {
    setMapping((prev) => {
      const next = { ...prev };
      if (!sourceHeader) {
        delete next[fieldKey];
      } else {
        next[fieldKey] = sourceHeader;
      }
      return next;
    });
  }

  function autoMap() {
    if (analysis) setMapping({ ...analysis.suggestedMapping });
  }

  function clearMapping() {
    setMapping({});
  }

  const identityOk = Boolean(mapping.patientId || mapping.accountNumber);

  const groupFields = useMemo(() => {
    if (!analysis) return [] as Array<{ group: string; fields: FieldDef[] }>;
    const order = ["identity", "demographics", "payer", "financial", "dates"];
    return order
      .map((group) => ({
        group,
        fields: analysis.fields.filter((f) => f.group === group),
      }))
      .filter((g) => g.fields.length);
  }, [analysis]);

  function sampleFor(sourceHeader: string | undefined): string {
    if (!sourceHeader || !analysis?.sampleRows[0]) return "";
    const v = analysis.sampleRows[0][sourceHeader];
    return v == null || v === "" ? "—" : String(v);
  }

  /** Headers already used by another target */
  function usedByOthers(exceptKey: string): Set<string> {
    const s = new Set<string>();
    for (const [k, v] of Object.entries(mapping)) {
      if (k !== exceptKey && v) s.add(v);
    }
    return s;
  }

  async function run(mode: "DRY_RUN" | "APPLY") {
    if (!clientId || !text.trim()) return;
    if (!identityOk) {
      setError("Map Patient ID and/or Account number before running import.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await api.post(`/imports/${clientId}/accounts`, {
        csvText: text,
        mode,
        fileName: fileName || undefined,
        columnMapping: mapping,
      });
      setResult(r.data);
      loadBatches();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || (e instanceof Error ? e.message : "Import failed");
      setError(typeof msg === "string" ? msg : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadTemplate() {
    const r = await api.get("/imports/accounts/template", {
      responseType: "text",
    });
    setText(typeof r.data === "string" ? r.data : String(r.data));
    setFileName("account-import-template.csv");
    setResult(null);
  }

  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <>
      <div className="topbar">
        <h1>Account import</h1>
        <div className="btn-row">
          <button className="btn" type="button" onClick={loadTemplate}>
            Load template
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy || !text.trim() || !identityOk}
            onClick={() => run("DRY_RUN")}
          >
            Preview (dry run)
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={busy || !text.trim() || !identityOk}
            onClick={() => run("APPLY")}
          >
            Apply import
          </button>
        </div>
      </div>

      <p className="muted">
        Upload a CSV, then map spreadsheet columns to system fields. Matching is by{" "}
        <span className="mono">patientId</span> then{" "}
        <span className="mono">accountNumber</span> within the selected client. You must
        map at least one identity field.
      </p>

      {error && <div className="error">{error}</div>}

      <div className="grid cols-2">
        <div className="card stack">
          <div className="field">
            <label>CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="field">
            <label>
              CSV text {fileName && <span className="muted">· {fileName}</span>}
              {analyzeBusy && <span className="muted"> · detecting columns…</span>}
            </label>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setResult(null);
              }}
              rows={12}
              className="mono"
              style={{ width: "100%", fontSize: "0.8rem" }}
              spellCheck={false}
            />
          </div>
          {analysis && (
            <p className="muted" style={{ margin: 0 }}>
              Detected <strong>{analysis.headers.length}</strong> columns ·{" "}
              <strong>{analysis.rowCount}</strong> data rows ·{" "}
              <strong>{mappedCount}</strong> fields mapped
            </p>
          )}
        </div>

        <div className="stack">
          {result && (
            <div className="card">
              <h2>Last result</h2>
              <p>
                Rows <strong>{result.rowCount}</strong> · Create{" "}
                <strong>{result.createdCount}</strong> · Update{" "}
                <strong>{result.updatedCount}</strong> · Errors{" "}
                <strong>{result.errorCount}</strong>
              </p>
              {result.sample.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Patient</th>
                      <th>Account</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sample.map((s, i) => (
                      <tr key={i}>
                        <td>
                          <span className="badge">{s.action}</span>
                        </td>
                        <td className="mono">{s.patientId || "—"}</td>
                        <td className="mono">{s.accountNumber || "—"}</td>
                        <td className="muted">{s.message || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {result.errors.length > 0 && (
                <>
                  <h3 style={{ marginTop: "1rem" }}>Errors</h3>
                  <ul className="muted" style={{ paddingLeft: "1.1rem" }}>
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <div className="card">
            <h2>Import history</h2>
            {!batches.length ? (
              <div className="empty">No imports yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>File</th>
                    <th>Mode</th>
                    <th>C / U</th>
                    <th>Err</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td className="muted" style={{ fontSize: "0.85rem" }}>
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                      <td>{b.fileName || "—"}</td>
                      <td>
                        <span className="badge">{b.mode}</span>
                      </td>
                      <td className="mono">
                        {b.createdCount}/{b.updatedCount}
                      </td>
                      <td className="mono">{b.errorCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {analysis && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <div className="topbar" style={{ marginBottom: "0.75rem" }}>
            <h2 style={{ margin: 0 }}>Column mapping</h2>
            <div className="btn-row">
              <button className="btn" type="button" onClick={autoMap}>
                Auto-match names
              </button>
              <button className="btn" type="button" onClick={clearMapping}>
                Clear all
              </button>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            For each system field, choose the spreadsheet column. Sample shows the first
            data row. Leave optional fields as “— skip —”.
          </p>
          {!identityOk && (
            <div className="error" style={{ marginBottom: "0.75rem" }}>
              Map Patient ID and/or Account number to continue.
            </div>
          )}

          {groupFields.map(({ group, fields }) => (
            <div key={group} style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>
                {GROUP_LABEL[group] || group}
              </h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>System field</th>
                      <th>Spreadsheet column</th>
                      <th>Sample value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => {
                      const used = usedByOthers(f.key);
                      const source = mapping[f.key] || "";
                      return (
                        <tr key={f.key}>
                          <td>
                            <strong>{f.label}</strong>
                            <div className="muted mono" style={{ fontSize: "0.8rem" }}>
                              {f.key}
                              {f.identity ? " · identity" : ""}
                              {f.type !== "string" ? ` · ${f.type}` : ""}
                            </div>
                          </td>
                          <td>
                            <select
                              value={source}
                              onChange={(e) => setFieldSource(f.key, e.target.value)}
                              style={{ minWidth: 200 }}
                            >
                              <option value="">— skip —</option>
                              {analysis.headers.map((h) => (
                                <option
                                  key={h}
                                  value={h}
                                  disabled={used.has(h) && h !== source}
                                >
                                  {h}
                                  {used.has(h) && h !== source ? " (used)" : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="mono" style={{ maxWidth: 220, overflow: "hidden" }}>
                            {sampleFor(source || undefined)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {analysis.headers.length > 0 && (
            <div>
              <h3 style={{ fontSize: "0.95rem" }}>Unmapped spreadsheet columns</h3>
              <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                {(() => {
                  const mappedSources = new Set(Object.values(mapping).filter(Boolean));
                  const leftover = analysis.headers.filter((h) => !mappedSources.has(h));
                  return leftover.length
                    ? leftover.join(", ")
                    : "All columns are assigned.";
                })()}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

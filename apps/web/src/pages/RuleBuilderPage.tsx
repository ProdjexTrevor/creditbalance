import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type FieldOpt = {
  value: string;
  label?: string;
  type: string;
  virtual?: boolean;
};

type Cond = {
  field: string;
  operator: string;
  valueJson: string;
  otherField: string;
};

const PAYER_CATEGORY_FIELDS = new Set([
  "primaryPayerCategory",
  "secondaryPayerCategory",
  "tertiaryPayerCategory",
  "anyPayerCategory",
]);

const BOOL_VIRTUAL_FIELDS = new Set(["payerMapped", "payerUnmapped"]);

export function RuleBuilderPage() {
  const { clientId } = useAuth();
  const nav = useNavigate();
  const [fields, setFields] = useState<FieldOpt[]>([]);
  const [operators, setOperators] = useState<string[]>([]);
  const [payerCats, setPayerCats] = useState<Array<{ code: string; name: string }>>([]);
  const [reasons, setReasons] = useState<Array<{ id: string; code: number; name: string }>>([]);
  const [packs, setPacks] = useState<Array<{ id: string; name: string; rules: unknown[] }>>([]);
  const [packId, setPackId] = useState("");
  const [name, setName] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [rank, setRank] = useState(1);
  const [conditions, setConditions] = useState<Cond[]>([
    { field: "totalBilledCharges", operator: "LTE", valueJson: "0", otherField: "" },
  ]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/rules/meta/fields").then((r) => {
      setFields(r.data.fields);
      setOperators(r.data.operators);
      setPayerCats(r.data.payerCategoryCodes ?? []);
    });
  }, []);

  useEffect(() => {
    if (!clientId) return;
    api
      .get("/catalog/refund-reasons", { params: { clientId } })
      .then((r) => {
        setReasons(r.data);
        if (r.data[0]) setReasonId(r.data[0].id);
      });
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    api.get(`/rules/packs/${clientId}`).then((r) => {
      setPacks(r.data);
      if (r.data[0]) {
        setPackId(r.data[0].id);
        setRank((r.data[0].rules?.length ?? 0) + 1);
      }
    });
  }, [clientId]);

  function updateCond(i: number, patch: Partial<Cond>) {
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function fieldLabel(f: FieldOpt) {
    const base = f.label || f.value;
    return f.virtual ? `${base} · mapped` : base;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setBusy(true);
    setError("");
    try {
      let pid = packId;
      if (!pid) {
        const created = await api.post(`/rules/packs/${clientId}`, {
          name: "Default hierarchy",
        });
        pid = created.data.id;
      }

      const groups = [
        {
          conditions: conditions.map((c) => {
            const isFieldOp = c.operator.endsWith("_FIELD");
            let valueJson: unknown = c.valueJson;
            if (c.operator === "IN" || c.operator === "NOT_IN") {
              valueJson = c.valueJson
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            } else if (
              !isFieldOp &&
              c.operator !== "IS_NULL" &&
              c.operator !== "IS_NOT_NULL" &&
              c.operator !== "LIKE" &&
              !PAYER_CATEGORY_FIELDS.has(c.field) &&
              !BOOL_VIRTUAL_FIELDS.has(c.field) &&
              c.valueJson !== "" &&
              !Number.isNaN(Number(c.valueJson))
            ) {
              valueJson = Number(c.valueJson);
            }
            return {
              field: c.field,
              operator: c.operator,
              valueJson: isFieldOp ? null : valueJson,
              otherField: isFieldOp || c.otherField ? c.otherField || null : null,
            };
          }),
        },
      ];

      await api.post(`/rules/packs/${pid}/rules`, {
        name,
        hierarchyRank: rank,
        targetRefundReasonId: reasonId,
        onlyUnclassified: true,
        groups,
      });
      nav("/rules");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Could not save rule";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <h1>New rule</h1>
      </div>
      <form className="card" onSubmit={submit} style={{ maxWidth: 900 }}>
        {error && <div className="error">{error}</div>}
        <p className="muted" style={{ marginTop: 0 }}>
          Use mapped payer fields (e.g. <span className="mono">anyPayerCategory</span> IN{" "}
          <span className="mono">medicaid</span>) so rules follow client payer maps instead of raw
          plan codes.
        </p>
        <div className="field">
          <label>Rule pack</label>
          <select value={packId} onChange={(e) => setPackId(e.target.value)}>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {!packs.length && <option value="">Will create default pack</option>}
          </select>
        </div>
        <div className="field">
          <label>Name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label>Hierarchy rank (1 = highest)</label>
            <input
              type="number"
              min={1}
              required
              value={rank}
              onChange={(e) => setRank(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Assign refund reason</label>
            <select required value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <h2 style={{ marginTop: "1rem" }}>Conditions (all must match)</h2>
        {conditions.map((c, i) => {
          const isPayerCat = PAYER_CATEGORY_FIELDS.has(c.field);
          const isBoolVirt = BOOL_VIRTUAL_FIELDS.has(c.field);
          return (
            <div key={i}>
              <div className="condition-row">
                <div className="field">
                  <label>Field</label>
                  <select
                    value={c.field}
                    onChange={(e) => {
                      const field = e.target.value;
                      const patch: Partial<Cond> = { field };
                      if (BOOL_VIRTUAL_FIELDS.has(field) && !c.valueJson) {
                        patch.valueJson = "true";
                        patch.operator = "EQ";
                      }
                      updateCond(i, patch);
                    }}
                  >
                    {fields.map((f) => (
                      <option key={f.value} value={f.value}>
                        {fieldLabel(f)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Operator</label>
                  <select
                    value={c.operator}
                    onChange={(e) => updateCond(i, { operator: e.target.value })}
                  >
                    {operators.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                {c.operator.endsWith("_FIELD") ? (
                  <div className="field">
                    <label>Other field</label>
                    <select
                      value={c.otherField}
                      onChange={(e) => updateCond(i, { otherField: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {fields.map((f) => (
                        <option key={f.value} value={f.value}>
                          {fieldLabel(f)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : isBoolVirt ? (
                  <div className="field">
                    <label>Value</label>
                    <select
                      value={c.valueJson || "true"}
                      onChange={(e) => updateCond(i, { valueJson: e.target.value })}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </div>
                ) : (
                  <div className="field">
                    <label>Value{isPayerCat ? " (category code)" : ""}</label>
                    <input
                      value={c.valueJson}
                      onChange={(e) => updateCond(i, { valueJson: e.target.value })}
                      placeholder={
                        c.operator.includes("IN")
                          ? "medicaid,medicare"
                          : isPayerCat
                            ? "medicaid"
                            : ""
                      }
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={conditions.length === 1}
                >
                  Remove
                </button>
              </div>
              {isPayerCat && payerCats.length > 0 && !c.operator.endsWith("_FIELD") && (
                <div className="btn-row" style={{ marginBottom: "0.75rem", flexWrap: "wrap" }}>
                  {payerCats.map((cat) => (
                    <button
                      key={cat.code}
                      type="button"
                      className="btn"
                      title={cat.name}
                      onClick={() => {
                        if (c.operator === "IN" || c.operator === "NOT_IN") {
                          const parts = c.valueJson
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          if (!parts.includes(cat.code)) parts.push(cat.code);
                          updateCond(i, { valueJson: parts.join(",") });
                        } else {
                          updateCond(i, { valueJson: cat.code, operator: c.operator || "EQ" });
                        }
                      }}
                    >
                      {cat.code}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              setConditions((prev) => [
                ...prev,
                { field: "anyPayerCategory", operator: "IN", valueJson: "medicaid", otherField: "" },
              ])
            }
          >
            + Payer category condition
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setConditions((prev) => [
                ...prev,
                { field: "totalBilledCharges", operator: "GT", valueJson: "0", otherField: "" },
              ])
            }
          >
            Add condition
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save rule"}
          </button>
        </div>
      </form>
    </>
  );
}

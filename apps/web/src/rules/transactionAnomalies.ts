/**
 * Transaction anomaly rules for the account workbench Overview tab.
 *
 * HOW TO EXTEND
 * 1. Add a rule definition to TRANSACTION_ANOMALY_RULES below.
 * 2. Implement the `check` function (or reuse helpers).
 * 3. Document it in /rules/TRANSACTION_ANOMALIES.md
 *
 * Severity:
 *  - error   → red row highlight (likely doesn’t make sense)
 *  - warning → amber row highlight (review)
 *  - info    → blue badge only
 */
export type AnomalySeverity = "error" | "warning" | "info";

export type TransactionSource = "EHR" | "ERA_835";

export type WorkbenchTransaction = {
  id: string;
  source?: TransactionSource | string | null;
  planCode?: string | null;
  planName?: string | null;
  postingCode?: string | null;
  postingDate?: string | null;
  postingAmount: string | number;
  transactionDescription?: string | null;
  transactionType?: string | null;
  receiptIdentification?: string | null;
  payerClaimControlNumber?: string | null;
  claimAdjustmentGroupCode?: string | null;
  claimStatusCode?: number | null;
  runningTotal?: string | number | null;
  sortOrder?: number | null;
};

export type AnomalyHit = {
  ruleId: string;
  severity: AnomalySeverity;
  message: string;
};

export type AnomalyRuleDef = {
  id: string;
  name: string;
  severity: AnomalySeverity;
  description: string;
  /** Which overviews this applies to */
  appliesTo: Array<"overview" | "ehr" | "835">;
  enabled: boolean;
  check: (ctx: AnomalyContext) => string | null;
};

export type AnomalyContext = {
  txn: WorkbenchTransaction;
  /** All txns chronological (oldest first) */
  all: WorkbenchTransaction[];
  /** Index of txn in `all` */
  index: number;
  /** Running total after this txn */
  runningTotal: number;
  amount: number;
  type: NormalizedType;
};

export type NormalizedType =
  | "charge"
  | "payment"
  | "adjustment"
  | "transfer"
  | "other";

export function num(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  if (typeof v === "object" && v !== null && "toNumber" in (v as object)) {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export function normalizeType(t?: string | null): NormalizedType {
  const s = (t || "").toLowerCase();
  if (s.includes("charge") || s.includes("debit")) return "charge";
  if (s.includes("payment") || s.includes("pmt") || s.includes("receipt"))
    return "payment";
  if (s.includes("adjust") || s.includes("contractual") || s.includes("write"))
    return "adjustment";
  if (s.includes("transfer") || s.includes("xfer")) return "transfer";
  return "other";
}

export function isCreditAmount(amount: number): boolean {
  // In this ledger, credits/payments/adjustments that reduce balance are negative
  return amount < 0;
}

export function isDebitAmount(amount: number): boolean {
  return amount > 0;
}

/** Sort transactions oldest → newest for running totals */
export function sortChronological(
  txns: WorkbenchTransaction[]
): WorkbenchTransaction[] {
  return [...txns].sort((a, b) => {
    const da = a.postingDate ? new Date(a.postingDate).getTime() : 0;
    const db = b.postingDate ? new Date(b.postingDate).getTime() : 0;
    if (da !== db) return da - db;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

function hasPriorOrAny(
  all: WorkbenchTransaction[],
  index: number,
  pred: (t: WorkbenchTransaction, i: number) => boolean,
  mode: "prior" | "any" = "any"
): boolean {
  return all.some((t, i) => {
    if (mode === "prior" && i >= index) return false;
    return pred(t, i);
  });
}

// ─── Rules (edit / extend here) ──────────────────────────────────────────────

export const TRANSACTION_ANOMALY_RULES: AnomalyRuleDef[] = [
  {
    id: "running_total_negative",
    name: "Running total negative",
    severity: "error",
    description:
      "After this transaction posts, the chronological running total is below zero (credit balance formed by this or earlier posts).",
    appliesTo: ["overview", "ehr", "835"],
    enabled: true,
    check: (ctx) => {
      if (ctx.runningTotal < -0.005) {
        return `Running total went negative (${ctx.runningTotal.toFixed(2)})`;
      }
      return null;
    },
  },
  {
    id: "payment_without_charge",
    name: "Insurance/patient payment without a charge",
    severity: "error",
    description:
      "A payment posted with no charge (positive amount) anywhere on the account.",
    appliesTo: ["overview", "ehr", "835"],
    enabled: true,
    check: (ctx) => {
      if (ctx.type !== "payment") return null;
      const hasCharge = hasPriorOrAny(ctx.all, ctx.index, (t) => {
        const ty = normalizeType(t.transactionType);
        const amt = num(t.postingAmount);
        return ty === "charge" || isDebitAmount(amt);
      });
      if (!hasCharge) {
        return "Payment posted with no charge on the account";
      }
      return null;
    },
  },
  {
    id: "adjustment_without_credit",
    name: "Adjustment without a credit/payment",
    severity: "error",
    description:
      "An adjustment posted where there is no payment/credit transaction on the account to pair with (suspicious standalone adj).",
    appliesTo: ["overview", "ehr", "835"],
    enabled: true,
    check: (ctx) => {
      if (ctx.type !== "adjustment") return null;
      const hasCredit = hasPriorOrAny(ctx.all, ctx.index, (t) => {
        const ty = normalizeType(t.transactionType);
        const amt = num(t.postingAmount);
        return ty === "payment" || (ty !== "charge" && isCreditAmount(amt));
      });
      // Also treat another adjustment credit as insufficient; need real payment/credit
      const hasPayment = hasPriorOrAny(ctx.all, ctx.index, (t) => {
        return normalizeType(t.transactionType) === "payment";
      });
      if (!hasPayment && !hasCredit) {
        return "Adjustment with no payment/credit on the account";
      }
      return null;
    },
  },
  {
    id: "adjustment_exceeds_charges",
    name: "Adjustment exceeds total charges",
    severity: "warning",
    description: "Absolute adjustment amount is greater than sum of charges.",
    appliesTo: ["overview", "ehr", "835"],
    enabled: true,
    check: (ctx) => {
      if (ctx.type !== "adjustment") return null;
      const chargeSum = ctx.all
        .filter((t) => normalizeType(t.transactionType) === "charge")
        .reduce((s, t) => s + Math.abs(num(t.postingAmount)), 0);
      if (chargeSum > 0 && Math.abs(ctx.amount) > chargeSum + 0.01) {
        return `Adjustment ${Math.abs(ctx.amount).toFixed(2)} exceeds charges ${chargeSum.toFixed(2)}`;
      }
      return null;
    },
  },
  {
    id: "payment_exceeds_charges",
    name: "Payment exceeds total charges",
    severity: "warning",
    description: "Absolute payment amount is greater than sum of charges.",
    appliesTo: ["overview", "ehr", "835"],
    enabled: true,
    check: (ctx) => {
      if (ctx.type !== "payment") return null;
      const chargeSum = ctx.all
        .filter((t) => normalizeType(t.transactionType) === "charge")
        .reduce((s, t) => s + Math.abs(num(t.postingAmount)), 0);
      if (chargeSum > 0 && Math.abs(ctx.amount) > chargeSum + 0.01) {
        return `Payment ${Math.abs(ctx.amount).toFixed(2)} exceeds charges ${chargeSum.toFixed(2)}`;
      }
      return null;
    },
  },
  {
    id: "zero_amount",
    name: "Zero amount transaction",
    severity: "info",
    description: "Posted amount is zero.",
    appliesTo: ["overview", "ehr", "835"],
    enabled: true,
    check: (ctx) => {
      if (Math.abs(ctx.amount) < 0.005) return "Zero amount transaction";
      return null;
    },
  },
  {
    id: "835_cas_without_payment",
    name: "835 CAS without payment on remittance",
    severity: "warning",
    description:
      "835 claim adjustment group present but no 835 payment transaction on the account.",
    appliesTo: ["overview", "835"],
    enabled: true,
    check: (ctx) => {
      const src = (ctx.txn.source || "").toUpperCase();
      if (src !== "ERA_835" && src !== "835") return null;
      if (!ctx.txn.claimAdjustmentGroupCode) return null;
      const has835Payment = ctx.all.some((t) => {
        const s = (t.source || "").toUpperCase();
        return (
          (s === "ERA_835" || s === "835") &&
          normalizeType(t.transactionType) === "payment"
        );
      });
      if (!has835Payment) {
        return `835 ${ctx.txn.claimAdjustmentGroupCode} adjustment with no 835 payment`;
      }
      return null;
    },
  },
];

// ─── Engine ──────────────────────────────────────────────────────────────────

export type AnnotatedTransaction = WorkbenchTransaction & {
  runningTotal: number;
  anomalies: AnomalyHit[];
  maxSeverity: AnomalySeverity | null;
};

export function evaluateAnomalies(
  transactions: WorkbenchTransaction[],
  tab: "overview" | "ehr" | "835" = "overview"
): AnnotatedTransaction[] {
  const chrono = sortChronological(transactions);
  let running = 0;
  const rules = TRANSACTION_ANOMALY_RULES.filter(
    (r) => r.enabled && r.appliesTo.includes(tab)
  );

  return chrono.map((txn, index) => {
    const amount = num(txn.postingAmount);
    running += amount;
    const type = normalizeType(txn.transactionType);
    const ctx: AnomalyContext = {
      txn,
      all: chrono,
      index,
      runningTotal: running,
      amount,
      type,
    };

    const anomalies: AnomalyHit[] = [];
    for (const rule of rules) {
      const message = rule.check(ctx);
      if (message) {
        anomalies.push({
          ruleId: rule.id,
          severity: rule.severity,
          message,
        });
      }
    }

    const maxSeverity = anomalies.some((a) => a.severity === "error")
      ? "error"
      : anomalies.some((a) => a.severity === "warning")
        ? "warning"
        : anomalies.length
          ? "info"
          : null;

    return {
      ...txn,
      runningTotal: running,
      anomalies,
      maxSeverity,
    };
  });
}

export function severityClass(severity: AnomalySeverity | null | undefined): string {
  if (severity === "error") return "txn-row-error";
  if (severity === "warning") return "txn-row-warning";
  if (severity === "info") return "txn-row-info";
  return "";
}

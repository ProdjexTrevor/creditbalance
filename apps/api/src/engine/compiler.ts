import { RuleOperator, type Prisma } from "@prisma/client";
import { isAccountField, isVirtualField, type AccountFieldKey } from "./fields.js";

export type LoadedCondition = {
  field: string;
  operator: RuleOperator;
  valueJson: unknown;
  otherField: string | null;
  listValues: string[];
};

export type LoadedGroup = {
  conditions: LoadedCondition[];
};

export type LoadedRule = {
  id: string;
  name: string;
  hierarchyRank: number;
  onlyUnclassified: boolean;
  targetRefundReasonId: string;
  groups: LoadedGroup[];
};

/**
 * Virtual fields and complex ops always evaluate in JS after payer enrichment.
 */
export function conditionToPrisma(
  cond: LoadedCondition
): { prisma?: Prisma.AccountWhereInput; jsEval?: LoadedCondition } {
  if (!isAccountField(cond.field)) {
    throw new Error(`Field not allowlisted: ${cond.field}`);
  }
  if (cond.otherField && !isAccountField(cond.otherField)) {
    throw new Error(`Other field not allowlisted: ${cond.otherField}`);
  }

  if (isVirtualField(cond.field) || (cond.otherField && isVirtualField(cond.otherField))) {
    return { jsEval: cond };
  }

  const field = cond.field as AccountFieldKey;
  const op = cond.operator;
  const val = cond.valueJson;
  const list = cond.listValues;

  if (
    op.startsWith("ABS_") ||
    op.endsWith("_FIELD") ||
    op === RuleOperator.LIKE
  ) {
    return { jsEval: cond };
  }

  switch (op) {
    case RuleOperator.EQ:
      return { prisma: { [field]: val as Prisma.JsonValue } };
    case RuleOperator.NEQ:
      return { prisma: { NOT: { [field]: val as Prisma.JsonValue } } };
    case RuleOperator.GT:
      return { prisma: { [field]: { gt: val as number | string } } };
    case RuleOperator.GTE:
      return { prisma: { [field]: { gte: val as number | string } } };
    case RuleOperator.LT:
      return { prisma: { [field]: { lt: val as number | string } } };
    case RuleOperator.LTE:
      return { prisma: { [field]: { lte: val as number | string } } };
    case RuleOperator.IS_NULL:
      return { prisma: { [field]: null } };
    case RuleOperator.IS_NOT_NULL:
      return { prisma: { [field]: { not: null } } };
    case RuleOperator.IN: {
      const values = list.length ? list : (val as string[]);
      return { prisma: { [field]: { in: values } } };
    }
    case RuleOperator.NOT_IN: {
      const values = list.length ? list : (val as string[]);
      return { prisma: { [field]: { notIn: values } } };
    }
    default:
      return { jsEval: cond };
  }
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function asList(cond: LoadedCondition): string[] {
  if (cond.listValues.length) return cond.listValues.map(String);
  if (Array.isArray(cond.valueJson)) return (cond.valueJson as unknown[]).map(String);
  if (cond.valueJson != null && cond.valueJson !== "") return [String(cond.valueJson)];
  return [];
}

function getLeft(account: Record<string, unknown>, field: string): unknown {
  if (field === "anyPayerCategory") {
    // Prefer category list for multi-membership
    return account.payerCategoryCodes ?? account.anyPayerCategory;
  }
  return account[field];
}

function listIncludesCategory(
  left: unknown,
  wanted: string[]
): boolean {
  const want = wanted.map((w) => w.toLowerCase().trim());
  if (Array.isArray(left)) {
    return left.some((c) => want.includes(String(c).toLowerCase()));
  }
  const s = str(left).toLowerCase();
  if (!s) return false;
  // comma-separated fallback
  if (s.includes(",")) {
    return s.split(",").some((p) => want.includes(p.trim()));
  }
  return want.includes(s);
}

export function evaluateCondition(
  account: Record<string, unknown>,
  cond: LoadedCondition
): boolean {
  if (!isAccountField(cond.field)) return false;

  // anyPayerCategory IN/NOT_IN against payerCategoryCodes[]
  if (cond.field === "anyPayerCategory") {
    const list = asList(cond).map((x) => x.toLowerCase());
    const codes = (account.payerCategoryCodes as string[] | undefined) ?? [];
    switch (cond.operator) {
      case RuleOperator.EQ:
        return listIncludesCategory(codes, [str(cond.valueJson)]);
      case RuleOperator.NEQ:
        return !listIncludesCategory(codes, [str(cond.valueJson)]);
      case RuleOperator.IN:
        return listIncludesCategory(codes, list);
      case RuleOperator.NOT_IN:
        return !listIncludesCategory(codes, list);
      case RuleOperator.IS_NULL:
        return codes.length === 0;
      case RuleOperator.IS_NOT_NULL:
        return codes.length > 0;
      default:
        break;
    }
  }

  const left = getLeft(account, cond.field);
  const rightField = cond.otherField;
  const right =
    rightField && isAccountField(rightField)
      ? getLeft(account, rightField)
      : cond.valueJson;
  const list = asList(cond);

  switch (cond.operator) {
    case RuleOperator.EQ: {
      // Case-insensitive for category codes
      if (
        cond.field.includes("Category") ||
        cond.field === "payerMapped" ||
        cond.field === "payerUnmapped"
      ) {
        return str(left).toLowerCase() === str(right).toLowerCase();
      }
      return str(left) === str(right) || num(left) === num(right);
    }
    case RuleOperator.NEQ:
      if (
        cond.field.includes("Category") ||
        cond.field === "payerMapped" ||
        cond.field === "payerUnmapped"
      ) {
        return str(left).toLowerCase() !== str(right).toLowerCase();
      }
      return str(left) !== str(right) && num(left) !== num(right);
    case RuleOperator.GT:
      return num(left) > num(right);
    case RuleOperator.GTE:
      return num(left) >= num(right);
    case RuleOperator.LT:
      return num(left) < num(right);
    case RuleOperator.LTE:
      return num(left) <= num(right);
    case RuleOperator.IS_NULL:
      return left == null || left === "" || (Array.isArray(left) && left.length === 0);
    case RuleOperator.IS_NOT_NULL:
      return (
        left != null &&
        left !== "" &&
        !(Array.isArray(left) && left.length === 0)
      );
    case RuleOperator.LIKE: {
      const pattern = str(cond.valueJson).replace(/%/g, ".*");
      return new RegExp(`^${pattern}$`, "i").test(str(left));
    }
    case RuleOperator.IN: {
      if (Array.isArray(left)) {
        return listIncludesCategory(left, list);
      }
      return list.map((x) => x.toLowerCase()).includes(str(left).toLowerCase());
    }
    case RuleOperator.NOT_IN: {
      if (Array.isArray(left)) {
        return !listIncludesCategory(left, list);
      }
      return !list.map((x) => x.toLowerCase()).includes(str(left).toLowerCase());
    }
    case RuleOperator.ABS_GT:
      return Math.abs(num(left)) > num(cond.valueJson);
    case RuleOperator.ABS_GTE:
      return Math.abs(num(left)) >= num(cond.valueJson);
    case RuleOperator.ABS_LT:
      return Math.abs(num(left)) < num(cond.valueJson);
    case RuleOperator.ABS_LTE:
      return Math.abs(num(left)) <= num(cond.valueJson);
    case RuleOperator.ABS_EQ:
      return Math.abs(num(left)) === num(cond.valueJson);
    case RuleOperator.ABS_EQ_FIELD:
      return Math.abs(num(left)) === Math.abs(num(right));
    case RuleOperator.ABS_GT_FIELD:
      return Math.abs(num(left)) > Math.abs(num(right));
    case RuleOperator.ABS_GTE_FIELD:
      return Math.abs(num(left)) >= Math.abs(num(right));
    case RuleOperator.GT_FIELD:
      return num(left) > num(right);
    case RuleOperator.GTE_FIELD:
      return num(left) >= num(right);
    case RuleOperator.LT_FIELD:
      return num(left) < num(right);
    case RuleOperator.LTE_FIELD:
      return num(left) <= num(right);
    case RuleOperator.EQ_FIELD:
      return num(left) === num(right) || str(left) === str(right);
    default:
      return false;
  }
}

export function evaluateRule(
  account: Record<string, unknown>,
  rule: LoadedRule
): boolean {
  if (rule.onlyUnclassified && account.refundReasonId != null) {
    return false;
  }
  if (!rule.groups.length) return false;

  return rule.groups.every((group) =>
    group.conditions.every((c) => evaluateCondition(account, c))
  );
}

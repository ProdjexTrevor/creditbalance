import type { ClientPayerMap, PayerCategory } from "@prisma/client";

export type PayerMapRow = ClientPayerMap & { payerCategory: PayerCategory };

export type PayerEnrichment = {
  primaryPayerCategory: string | null;
  secondaryPayerCategory: string | null;
  tertiaryPayerCategory: string | null;
  /** Distinct category codes matched on any plan */
  payerCategoryCodes: string[];
  /** For anyPayerCategory field string ops — first code or comma-join not used; use array */
  anyPayerCategory: string | null;
  payerMapped: "true" | "false";
  payerUnmapped: "true" | "false";
};

/**
 * Build lookup: plan code (upper) → category code, plan name (upper) → category code
 */
export function buildPayerLookup(maps: PayerMapRow[]) {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const m of maps) {
    if (!m.active) continue;
    const cat = m.payerCategory.code.toLowerCase();
    if (m.sourcePlanCode) {
      byCode.set(m.sourcePlanCode.trim().toUpperCase(), cat);
    }
    if (m.sourcePlanName) {
      byName.set(m.sourcePlanName.trim().toUpperCase(), cat);
    }
  }
  return { byCode, byName };
}

function resolveCategory(
  planCode: string | null | undefined,
  planName: string | null | undefined,
  lookup: ReturnType<typeof buildPayerLookup>
): string | null {
  if (planCode) {
    const c = lookup.byCode.get(planCode.trim().toUpperCase());
    if (c) return c;
  }
  if (planName) {
    const c = lookup.byName.get(planName.trim().toUpperCase());
    if (c) return c;
  }
  return null;
}

export function enrichAccountWithPayerMaps(
  account: {
    planCode1?: string | null;
    planCode2?: string | null;
    planCode3?: string | null;
    primaryInsurance?: string | null;
    secondaryInsurance?: string | null;
    tertiaryInsurance?: string | null;
  },
  lookup: ReturnType<typeof buildPayerLookup>
): PayerEnrichment {
  const primary = resolveCategory(
    account.planCode1,
    account.primaryInsurance,
    lookup
  );
  const secondary = resolveCategory(
    account.planCode2,
    account.secondaryInsurance,
    lookup
  );
  const tertiary = resolveCategory(
    account.planCode3,
    account.tertiaryInsurance,
    lookup
  );

  const payerCategoryCodes = [
    ...new Set(
      [primary, secondary, tertiary].filter(Boolean) as string[]
    ),
  ];

  const hasPrimaryCode = Boolean(
    (account.planCode1 && account.planCode1.trim()) ||
      (account.primaryInsurance && account.primaryInsurance.trim())
  );

  return {
    primaryPayerCategory: primary,
    secondaryPayerCategory: secondary,
    tertiaryPayerCategory: tertiary,
    payerCategoryCodes,
    anyPayerCategory: payerCategoryCodes[0] ?? null,
    payerMapped: primary ? "true" : "false",
    payerUnmapped: hasPrimaryCode && !primary ? "true" : "false",
  };
}

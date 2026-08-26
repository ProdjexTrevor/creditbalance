/**
 * Allowlisted fields for rule conditions.
 * Includes virtual/payer-map fields resolved at runtime (not Prisma columns).
 */
export const ACCOUNT_FIELDS = {
  // Account balances / financial
  totalBilledCharges: { column: "totalBilledCharges", type: "number", virtual: false },
  patientAccountBalance: { column: "patientAccountBalance", type: "number", virtual: false },
  totalNetPmts: { column: "totalNetPmts", type: "number", virtual: false },
  netAdminOtherAdj: { column: "netAdminOtherAdj", type: "number", virtual: false },
  netContractualAdj: { column: "netContractualAdj", type: "number", virtual: false },
  netPgp: { column: "netPgp", type: "number", virtual: false },
  eraCharges: { column: "eraCharges", type: "number", virtual: false },
  eraTotal: { column: "eraTotal", type: "number", virtual: false },
  ptRepEra: { column: "ptRepEra", type: "number", virtual: false },
  netSecondaryPayment: { column: "netSecondaryPayment", type: "number", virtual: false },
  charityWo: { column: "charityWo", type: "number", virtual: false },
  // Raw plan codes / names (source system)
  planCode1: { column: "planCode1", type: "string", virtual: false },
  planCode2: { column: "planCode2", type: "string", virtual: false },
  planCode3: { column: "planCode3", type: "string", virtual: false },
  primaryInsurance: { column: "primaryInsurance", type: "string", virtual: false },
  secondaryInsurance: { column: "secondaryInsurance", type: "string", virtual: false },
  tertiaryInsurance: { column: "tertiaryInsurance", type: "string", virtual: false },
  location: { column: "location", type: "string", virtual: false },
  patientType: { column: "patientType", type: "string", virtual: false },
  refundReasonId: { column: "refundReasonId", type: "string", virtual: false },
  // Payer map virtuals (from ClientPayerMap → PayerCategory)
  primaryPayerCategory: {
    column: null,
    type: "string",
    virtual: true,
    label: "Primary payer category (mapped)",
  },
  secondaryPayerCategory: {
    column: null,
    type: "string",
    virtual: true,
    label: "Secondary payer category (mapped)",
  },
  tertiaryPayerCategory: {
    column: null,
    type: "string",
    virtual: true,
    label: "Tertiary payer category (mapped)",
  },
  /** Any of plan 1–3 maps to category; use IN with codes e.g. medicaid,medicare */
  anyPayerCategory: {
    column: null,
    type: "string",
    virtual: true,
    label: "Any payer category (mapped)",
  },
  /** "true" | "false" — primary plan code has an active client map */
  payerMapped: {
    column: null,
    type: "string",
    virtual: true,
    label: "Primary plan mapped (true/false)",
  },
  /** "true" | "false" — primary has a plan code but no map */
  payerUnmapped: {
    column: null,
    type: "string",
    virtual: true,
    label: "Primary plan unmapped (true/false)",
  },
} as const;

export type AccountFieldKey = keyof typeof ACCOUNT_FIELDS;

export function isAccountField(field: string): field is AccountFieldKey {
  return field in ACCOUNT_FIELDS;
}

export function isVirtualField(field: string): boolean {
  if (!isAccountField(field)) return false;
  return ACCOUNT_FIELDS[field].virtual === true;
}

export const FIELD_OPTIONS = Object.entries(ACCOUNT_FIELDS).map(([key, meta]) => ({
  value: key,
  label: "label" in meta && meta.label ? meta.label : key,
  type: meta.type,
  virtual: meta.virtual,
}));

/** Known payer category codes used in seed / docs (not exclusive) */
export const PAYER_CATEGORY_CODES = [
  "medicare",
  "medicaid",
  "commercial",
  "self_pay",
  "government",
  "charity",
] as const;

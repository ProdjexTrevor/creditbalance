import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { parseCsv } from "./csv.js";

/** Canonical field → accepted CSV header aliases (case-insensitive) */
export const FIELD_ALIASES: Record<string, string[]> = {
  patientId: ["patientId", "PatientID", "patient_id", "MRN", "mrn"],
  accountNumber: [
    "accountNumber",
    "AccountNumber",
    "account_number",
    "Account #",
    "account",
  ],
  firstName: ["firstName", "FirstName", "first_name", "fname"],
  lastName: ["lastName", "LastName", "last_name", "lname"],
  medicalRecordNumber: [
    "medicalRecordNumber",
    "MedicalRecordNumber",
    "MRN_Display",
    "medical_record_number",
  ],
  location: ["location", "Location", "facility"],
  patientType: ["patientType", "PatientType", "patient_type"],
  primaryInsurance: [
    "primaryInsurance",
    "PrimaryInsurance",
    "primary_insurance",
    "Ins1",
  ],
  secondaryInsurance: [
    "secondaryInsurance",
    "SecondaryInsurance",
    "secondary_insurance",
    "Ins2",
  ],
  tertiaryInsurance: [
    "tertiaryInsurance",
    "TertiaryInsurance",
    "tertiary_insurance",
    "Ins3",
  ],
  planCode1: ["planCode1", "PlanCode1", "plan_code_1", "PrimaryPlanCode"],
  planCode2: ["planCode2", "PlanCode2", "plan_code_2", "SecondaryPlanCode"],
  planCode3: ["planCode3", "PlanCode3", "plan_code_3", "TertiaryPlanCode"],
  totalBilledCharges: [
    "totalBilledCharges",
    "TotalBilledCharges",
    "total_billed_charges",
    "Charges",
  ],
  patientAccountBalance: [
    "patientAccountBalance",
    "PatientAccountBalance",
    "patient_account_balance",
    "Balance",
    "CreditBalance",
  ],
  totalNetPmts: ["totalNetPmts", "TotalNetPmts", "total_net_pmts", "Payments"],
  netAdminOtherAdj: [
    "netAdminOtherAdj",
    "NetAdminOtherAdj",
    "net_admin_other_adj",
    "AdminAdj",
  ],
  netContractualAdj: [
    "netContractualAdj",
    "NetContractualAdj",
    "net_contractual_adj",
    "Contractual",
  ],
  netPgp: ["netPgp", "NetPgp", "net_pgp", "PatientPayments", "PtPmts"],
  eraCharges: ["eraCharges", "EraCharges", "era_charges"],
  eraTotal: ["eraTotal", "EraTotal", "era_total"],
  ptRepEra: ["ptRepEra", "PtRepEra", "pt_rep_era"],
  netSecondaryPayment: [
    "netSecondaryPayment",
    "NetSecondaryPayment",
    "net_secondary_payment",
  ],
  charityWo: ["charityWo", "CharityWo", "charity_wo", "Charity"],
  admitDate: ["admitDate", "AdmitDate", "admit_date"],
  dischargeDate: ["dischargeDate", "DischargeDate", "discharge_date"],
  fileDate: ["fileDate", "FileDate", "file_date"],
};

export type ImportFieldType = "string" | "money" | "date";

export type ImportFieldDef = {
  key: string;
  label: string;
  type: ImportFieldType;
  /** Soft-required: need patientId OR accountNumber mapped */
  identity?: boolean;
  group: "identity" | "demographics" | "payer" | "financial" | "dates";
};

/** Target columns users map spreadsheet headers into */
export const IMPORT_FIELD_DEFS: ImportFieldDef[] = [
  { key: "patientId", label: "Patient ID", type: "string", identity: true, group: "identity" },
  {
    key: "accountNumber",
    label: "Account number",
    type: "string",
    identity: true,
    group: "identity",
  },
  { key: "firstName", label: "First name", type: "string", group: "demographics" },
  { key: "lastName", label: "Last name", type: "string", group: "demographics" },
  {
    key: "medicalRecordNumber",
    label: "Medical record number",
    type: "string",
    group: "demographics",
  },
  { key: "location", label: "Location / facility", type: "string", group: "demographics" },
  { key: "patientType", label: "Patient type", type: "string", group: "demographics" },
  {
    key: "primaryInsurance",
    label: "Primary insurance name",
    type: "string",
    group: "payer",
  },
  {
    key: "secondaryInsurance",
    label: "Secondary insurance name",
    type: "string",
    group: "payer",
  },
  {
    key: "tertiaryInsurance",
    label: "Tertiary insurance name",
    type: "string",
    group: "payer",
  },
  { key: "planCode1", label: "Primary plan code", type: "string", group: "payer" },
  { key: "planCode2", label: "Secondary plan code", type: "string", group: "payer" },
  { key: "planCode3", label: "Tertiary plan code", type: "string", group: "payer" },
  {
    key: "totalBilledCharges",
    label: "Total billed charges",
    type: "money",
    group: "financial",
  },
  {
    key: "patientAccountBalance",
    label: "Patient / credit balance",
    type: "money",
    group: "financial",
  },
  { key: "totalNetPmts", label: "Total net payments", type: "money", group: "financial" },
  {
    key: "netAdminOtherAdj",
    label: "Admin / other adjustments",
    type: "money",
    group: "financial",
  },
  {
    key: "netContractualAdj",
    label: "Contractual adjustments",
    type: "money",
    group: "financial",
  },
  { key: "netPgp", label: "Patient payments (net PGP)", type: "money", group: "financial" },
  { key: "eraCharges", label: "ERA / 835 charges", type: "money", group: "financial" },
  { key: "eraTotal", label: "ERA total", type: "money", group: "financial" },
  { key: "ptRepEra", label: "Patient resp. ERA", type: "money", group: "financial" },
  {
    key: "netSecondaryPayment",
    label: "Secondary payment",
    type: "money",
    group: "financial",
  },
  { key: "charityWo", label: "Charity write-off", type: "money", group: "financial" },
  { key: "admitDate", label: "Admit date", type: "date", group: "dates" },
  { key: "dischargeDate", label: "Discharge date", type: "date", group: "dates" },
  { key: "fileDate", label: "File date", type: "date", group: "dates" },
];

const MONEY_FIELDS = new Set(
  IMPORT_FIELD_DEFS.filter((f) => f.type === "money").map((f) => f.key)
);
const DATE_FIELDS = new Set(
  IMPORT_FIELD_DEFS.filter((f) => f.type === "date").map((f) => f.key)
);

export type ImportRowError = { row: number; message: string; accountNumber?: string };

export type AccountImportResult = {
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: ImportRowError[];
  sample: Array<{
    action: "create" | "update" | "error" | "skip";
    patientId?: string;
    accountNumber?: string;
    message?: string;
  }>;
  /** Mapping used for the run (target → source header) */
  columnMapping?: Record<string, string>;
};

/** targetField → source spreadsheet column (empty / omit = skip) */
export type ColumnMapping = Record<string, string>;

function normKey(h: string): string {
  return h.trim().toLowerCase().replace(/[\s#-]+/g, "_");
}

/** Auto-guess mapping from header names / aliases */
export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const auto = buildAutoHeaderMap(headers);
  const out: ColumnMapping = {};
  for (const def of IMPORT_FIELD_DEFS) {
    const hit = auto.get(def.key);
    if (hit) out[def.key] = hit;
  }
  return out;
}

function buildAutoHeaderMap(headers: string[]): Map<string, string> {
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    byNorm.set(normKey(h), h);
  }

  const map = new Map<string, string>(); // canonical -> original header
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const hit = byNorm.get(normKey(alias));
      if (hit) {
        map.set(canonical, hit);
        break;
      }
    }
  }
  return map;
}

/**
 * Build canonical→source map from user mapping.
 * Values must match headers (or we still try exact string).
 */
export function headerMapFromColumnMapping(
  columnMapping: ColumnMapping,
  headers: string[]
): Map<string, string> {
  const headerSet = new Set(headers);
  const byNorm = new Map(headers.map((h) => [normKey(h), h]));
  const map = new Map<string, string>();

  for (const [target, source] of Object.entries(columnMapping)) {
    if (!source || !String(source).trim()) continue;
    if (!IMPORT_FIELD_DEFS.some((d) => d.key === target)) continue;
    let resolved = source;
    if (!headerSet.has(source)) {
      const n = byNorm.get(normKey(source));
      if (!n) continue;
      resolved = n;
    }
    map.set(target, resolved);
  }
  return map;
}

export function resolveHeaderMap(
  headers: string[],
  columnMapping?: ColumnMapping | null
): Map<string, string> {
  if (columnMapping && Object.keys(columnMapping).length > 0) {
    return headerMapFromColumnMapping(columnMapping, headers);
  }
  return buildAutoHeaderMap(headers);
}

export function analyzeCsvForMapping(csvText: string) {
  const { headers, rows } = parseCsv(csvText);
  const suggested = suggestColumnMapping(headers);
  const sampleRows = rows.slice(0, 5);
  return {
    headers,
    rowCount: rows.length,
    sampleRows,
    suggestedMapping: suggested,
    fields: IMPORT_FIELD_DEFS,
  };
}

function parseMoney(raw: string): number | null {
  if (raw == null || raw === "") return null;
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rowToData(
  row: Record<string, string>,
  headerMap: Map<string, string>
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [canonical, header] of headerMap.entries()) {
    const raw = row[header] ?? "";
    if (raw === "") continue;
    if (MONEY_FIELDS.has(canonical)) {
      const n = parseMoney(raw);
      if (n != null) data[canonical] = n;
    } else if (DATE_FIELDS.has(canonical)) {
      const d = parseDate(raw);
      if (d) data[canonical] = d;
    } else {
      data[canonical] = raw;
    }
  }
  return data;
}

export function resolveMappedRow(
  row: Record<string, string>,
  headerMap: Map<string, string>
):
  | {
      patientId: string;
      accountNumber: string;
      fields: Omit<
        Prisma.AccountCreateManyInput,
        "clientId" | "patientId" | "accountNumber"
      >;
    }
  | { error: string } {
  const mapped = rowToData(row, headerMap);
  let patientId = String(mapped.patientId ?? "").trim();
  let accountNumber = String(mapped.accountNumber ?? "").trim();

  if (!patientId && accountNumber) patientId = accountNumber;
  if (!accountNumber && patientId) accountNumber = patientId;
  if (!patientId || !accountNumber) {
    return {
      error:
        "patientId and accountNumber are required (map at least one identity column)",
    };
  }

  const fields: Omit<
    Prisma.AccountCreateManyInput,
    "clientId" | "patientId" | "accountNumber"
  > = {
    firstName: (mapped.firstName as string) || null,
    lastName: (mapped.lastName as string) || null,
    medicalRecordNumber: (mapped.medicalRecordNumber as string) || null,
    location: (mapped.location as string) || null,
    patientType: (mapped.patientType as string) || null,
    primaryInsurance: (mapped.primaryInsurance as string) || null,
    secondaryInsurance: (mapped.secondaryInsurance as string) || null,
    tertiaryInsurance: (mapped.tertiaryInsurance as string) || null,
    planCode1: (mapped.planCode1 as string) || null,
    planCode2: (mapped.planCode2 as string) || null,
    planCode3: (mapped.planCode3 as string) || null,
    totalBilledCharges: (mapped.totalBilledCharges as number) ?? 0,
    patientAccountBalance: (mapped.patientAccountBalance as number) ?? 0,
    totalNetPmts: (mapped.totalNetPmts as number) ?? 0,
    netAdminOtherAdj: (mapped.netAdminOtherAdj as number) ?? 0,
    netContractualAdj: (mapped.netContractualAdj as number) ?? 0,
    netPgp: (mapped.netPgp as number) ?? 0,
    eraCharges: (mapped.eraCharges as number) ?? 0,
    eraTotal: (mapped.eraTotal as number) ?? 0,
    ptRepEra: (mapped.ptRepEra as number) ?? 0,
    netSecondaryPayment: (mapped.netSecondaryPayment as number) ?? 0,
    charityWo: (mapped.charityWo as number) ?? 0,
    admitDate: (mapped.admitDate as Date) || null,
    dischargeDate: (mapped.dischargeDate as Date) || null,
    fileDate: (mapped.fileDate as Date) || null,
  };

  return { patientId, accountNumber, fields };
}

function mappingToObject(map: Map<string, string>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of map) o[k] = v;
  return o;
}

export async function importAccountsFromCsv(opts: {
  clientId: string;
  csvText: string;
  mode: "DRY_RUN" | "APPLY";
  userId?: string;
  fileName?: string;
  /** target field → source CSV header */
  columnMapping?: ColumnMapping | null;
}): Promise<AccountImportResult & { importBatchId?: string }> {
  const { headers, rows } = parseCsv(opts.csvText);
  if (!headers.length) {
    return {
      rowCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      errors: [{ row: 0, message: "Empty CSV or missing header row" }],
      sample: [],
    };
  }

  const headerMap = resolveHeaderMap(headers, opts.columnMapping);
  if (!headerMap.has("patientId") && !headerMap.has("accountNumber")) {
    return {
      rowCount: rows.length,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      errors: [
        {
          row: 0,
          message:
            "Map Patient ID and/or Account number to a spreadsheet column before importing",
        },
      ],
      sample: [],
      columnMapping: mappingToObject(headerMap),
    };
  }

  const client = await prisma.client.findUniqueOrThrow({
    where: { id: opts.clientId },
    select: { tenantId: true },
  });

  const existing = await prisma.account.findMany({
    where: { clientId: opts.clientId },
    select: { id: true, patientId: true, accountNumber: true },
  });
  const byPatient = new Map(existing.map((a) => [a.patientId, a]));
  const byAccount = new Map(existing.map((a) => [a.accountNumber, a]));

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const errors: ImportRowError[] = [];
  const sample: AccountImportResult["sample"] = [];
  const openStatus = await prisma.refundStatus.findFirst({
    where: { tenantId: client.tenantId, code: 1, active: true },
  });

  const toCreate: Prisma.AccountCreateManyInput[] = [];
  const toUpdate: Array<{ id: string; data: Prisma.AccountUpdateInput }> = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const resolved = resolveMappedRow(rows[i], headerMap);
    if ("error" in resolved) {
      errors.push({ row: rowNum, message: resolved.error });
      if (sample.length < 30) {
        sample.push({ action: "error", message: resolved.error });
      }
      continue;
    }

    const { patientId, accountNumber, fields } = resolved;
    const hit = byPatient.get(patientId) || byAccount.get(accountNumber);
    if (hit) {
      toUpdate.push({
        id: hit.id,
        data: {
          accountNumber,
          ...fields,
        },
      });
      updatedCount++;
      if (sample.length < 30) {
        sample.push({ action: "update", patientId, accountNumber });
      }
    } else {
      toCreate.push({
        clientId: opts.clientId,
        patientId,
        accountNumber,
        ...fields,
        refundStatusId: openStatus?.id ?? null,
      });
      byPatient.set(patientId, { id: "pending", patientId, accountNumber });
      byAccount.set(accountNumber, { id: "pending", patientId, accountNumber });
      createdCount++;
      if (sample.length < 30) {
        sample.push({ action: "create", patientId, accountNumber });
      }
    }
  }

  if (opts.mode === "APPLY") {
    if (toCreate.length) {
      const chunk = 50;
      for (let i = 0; i < toCreate.length; i += chunk) {
        const slice = toCreate.slice(i, i + chunk);
        try {
          await prisma.account.createMany({ data: slice });
        } catch {
          for (const row of slice) {
            try {
              await prisma.account.create({ data: row });
            } catch (e) {
              createdCount--;
              skippedCount++;
              errors.push({
                row: 0,
                accountNumber: row.accountNumber,
                message: e instanceof Error ? e.message : "Create failed",
              });
            }
          }
        }
      }
    }
    for (const u of toUpdate) {
      try {
        await prisma.account.update({ where: { id: u.id }, data: u.data });
      } catch (e) {
        updatedCount--;
        errors.push({
          row: 0,
          message: e instanceof Error ? e.message : "Update failed",
        });
      }
    }
  }

  const usedMapping = mappingToObject(headerMap);
  const result: AccountImportResult = {
    rowCount: rows.length,
    createdCount,
    updatedCount,
    skippedCount,
    errorCount: errors.length,
    errors: errors.slice(0, 50),
    sample,
    columnMapping: usedMapping,
  };

  const batch = await prisma.importBatch.create({
    data: {
      clientId: opts.clientId,
      userId: opts.userId,
      kind: "ACCOUNTS",
      fileName: opts.fileName,
      mode: opts.mode,
      status: "COMPLETED",
      rowCount: result.rowCount,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      errorsJson: {
        errors: result.errors,
        columnMapping: usedMapping,
      },
    },
  });

  return { ...result, importBatchId: batch.id };
}

export const ACCOUNT_IMPORT_TEMPLATE_HEADERS = [
  "patientId",
  "accountNumber",
  "firstName",
  "lastName",
  "primaryInsurance",
  "planCode1",
  "totalBilledCharges",
  "patientAccountBalance",
  "netPgp",
  "netAdminOtherAdj",
  "netContractualAdj",
  "eraCharges",
  "charityWo",
  "location",
  "patientType",
];

export function sampleCsvTemplate(): string {
  const header = ACCOUNT_IMPORT_TEMPLATE_HEADERS.join(",");
  const sample = [
    "PID9001,A9001,Jane,Doe,MEDICAID PLAN ALPHA,C95,1200.00,-150.00,-50.00,0,800,1000,0,MAIN,I",
    "PID9002,A9002,John,Smith,COMMERCIAL AETNA SAMPLE,COMM2,500.00,-80.00,0,0,200,500,0,NORTH,O",
  ].join("\n");
  return `${header}\n${sample}\n`;
}

import type { Prisma } from "@prisma/client";

type FhirPatient = {
  id?: string;
  identifier?: Array<{ system?: string; value?: string; type?: { text?: string } }>;
  name?: Array<{ family?: string; given?: string[]; use?: string }>;
  birthDate?: string;
};

type FhirCoverage = {
  id?: string;
  status?: string;
  subscriberId?: string;
  payor?: Array<{ display?: string; reference?: string }>;
  class?: Array<{ type?: { coding?: Array<{ code?: string }> }; value?: string; name?: string }>;
  order?: number;
};

type FhirAccount = {
  id?: string;
  identifier?: Array<{ system?: string; value?: string }>;
  status?: string;
  description?: string;
  subject?: Array<{ reference?: string; display?: string }>;
  coverage?: Array<{ coverage?: { reference?: string; display?: string }; priority?: number }>;
};

export function extractMrn(
  patient: FhirPatient,
  preferredSystem?: string | null
): string | null {
  const ids = patient.identifier ?? [];
  if (preferredSystem) {
    const hit = ids.find(
      (i) => i.system === preferredSystem && i.value
    );
    if (hit?.value) return hit.value;
  }
  const mrnLike = ids.find(
    (i) =>
      i.value &&
      (i.type?.text?.toLowerCase().includes("mrn") ||
        i.system?.includes("MRN") ||
        i.system?.startsWith("urn:oid:"))
  );
  if (mrnLike?.value) return mrnLike.value;
  return ids.find((i) => i.value)?.value ?? null;
}

export function patientName(patient: FhirPatient): {
  firstName: string | null;
  lastName: string | null;
} {
  const official =
    patient.name?.find((n) => n.use === "official") ?? patient.name?.[0];
  return {
    firstName: official?.given?.[0] ?? null,
    lastName: official?.family ?? null,
  };
}

export function mapCoveragesToPlans(coverages: FhirCoverage[]): {
  primaryInsurance: string | null;
  secondaryInsurance: string | null;
  tertiaryInsurance: string | null;
  planCode1: string | null;
  planCode2: string | null;
  planCode3: string | null;
} {
  const active = coverages.filter((c) => c.status === "active" || !c.status);
  const sorted = [...active].sort(
    (a, b) => (a.order ?? 99) - (b.order ?? 99)
  );

  function planLabel(c: FhirCoverage): string | null {
    return c.payor?.[0]?.display ?? c.class?.[0]?.name ?? null;
  }

  function planCode(c: FhirCoverage): string | null {
    return (
      c.subscriberId ??
      c.class?.[0]?.value ??
      c.class?.[0]?.type?.coding?.[0]?.code ??
      null
    );
  }

  const [p, s, t] = sorted;
  return {
    primaryInsurance: p ? planLabel(p) : null,
    secondaryInsurance: s ? planLabel(s) : null,
    tertiaryInsurance: t ? planLabel(t) : null,
    planCode1: p ? planCode(p) : null,
    planCode2: s ? planCode(s) : null,
    planCode3: t ? planCode(t) : null,
  };
}

export function mapAccountNumber(
  account: FhirAccount,
  fallbackMrn: string
): string {
  const idVal = account.identifier?.find((i) => i.value)?.value;
  return idVal || account.id || fallbackMrn;
}

/** Map Epic FHIR bundle → Credit Balance account upsert shape */
export function mapEpicPatientToAccount(
  patient: FhirPatient,
  coverages: FhirCoverage[],
  account: FhirAccount | null,
  mrnSystem?: string | null
): Omit<
  Prisma.AccountCreateManyInput,
  "clientId" | "refundReasonId" | "refundStatusId"
> {
  const mrn = extractMrn(patient, mrnSystem) || patient.id || "UNKNOWN";
  const { firstName, lastName } = patientName(patient);
  const plans = mapCoveragesToPlans(coverages);
  const acctNum = account
    ? mapAccountNumber(account, mrn)
    : mrn;

  return {
    patientId: mrn,
    accountNumber: acctNum,
    firstName,
    lastName,
    medicalRecordNumber: mrn,
    primaryInsurance: plans.primaryInsurance,
    secondaryInsurance: plans.secondaryInsurance,
    tertiaryInsurance: plans.tertiaryInsurance,
    planCode1: plans.planCode1,
    planCode2: plans.planCode2,
    planCode3: plans.planCode3,
    epicPatientFhirId: patient.id ?? null,
    epicAccountFhirId: account?.id ?? null,
    lastEpicSyncAt: new Date(),
    // Balances not reliably in public FHIR Account — keep existing or CSV/import values
    totalBilledCharges: 0,
    patientAccountBalance: 0,
    totalNetPmts: 0,
    netAdminOtherAdj: 0,
    netContractualAdj: 0,
    netPgp: 0,
    eraCharges: 0,
    eraTotal: 0,
    ptRepEra: 0,
    netSecondaryPayment: 0,
    charityWo: 0,
  };
}

export type EpicPatientPreview = {
  epicPatientFhirId: string;
  mrn: string;
  firstName: string | null;
  lastName: string | null;
  accountNumber: string;
  primaryInsurance: string | null;
  planCode1: string | null;
  accountStatus: string | null;
};

export function toPreview(
  patient: FhirPatient,
  coverages: FhirCoverage[],
  account: FhirAccount | null,
  mrnSystem?: string | null
): EpicPatientPreview {
  const mapped = mapEpicPatientToAccount(patient, coverages, account, mrnSystem);
  return {
    epicPatientFhirId: patient.id ?? "",
    mrn: mapped.patientId,
    firstName: mapped.firstName ?? null,
    lastName: mapped.lastName ?? null,
    accountNumber: mapped.accountNumber,
    primaryInsurance: mapped.primaryInsurance ?? null,
    planCode1: mapped.planCode1 ?? null,
    accountStatus: account?.status ?? null,
  };
}

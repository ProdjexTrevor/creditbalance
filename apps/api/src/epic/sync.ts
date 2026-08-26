import type { ClientEpicConnection } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { EpicFhirClient, bundleResources } from "./fhirClient.js";
import { fetchEpicAccessToken } from "./oauth.js";
import {
  mapEpicPatientToAccount,
  toPreview,
  type EpicPatientPreview,
} from "./mappers.js";

export type EpicSearchParams = {
  family?: string;
  given?: string;
  birthdate?: string;
  mrn?: string;
  fhirPatientId?: string;
};

async function getClient(conn: ClientEpicConnection): Promise<EpicFhirClient> {
  const token = await fetchEpicAccessToken(conn);
  await prisma.clientEpicConnection.update({
    where: { id: conn.id },
    data: { lastTokenAt: new Date(), lastError: null },
  });
  return new EpicFhirClient(conn.fhirBaseUrl, token.access_token);
}

async function loadPatientBundle(
  fhir: EpicFhirClient,
  conn: ClientEpicConnection,
  params: EpicSearchParams
) {
  if (params.fhirPatientId) {
    const patient = await fhir.readPatient(params.fhirPatientId);
    return [patient as Record<string, unknown>];
  }

  const identifier =
    params.mrn && conn.mrnSystem
      ? `${conn.mrnSystem}|${params.mrn}`
      : params.mrn
        ? params.mrn
        : undefined;

  const bundle = await fhir.searchPatients({
    family: params.family,
    given: params.given,
    birthdate: params.birthdate,
    identifier,
  });

  return bundleResources(bundle) as Record<string, unknown>[];
}

async function enrichPatient(
  fhir: EpicFhirClient,
  conn: ClientEpicConnection,
  patient: Record<string, unknown>
): Promise<EpicPatientPreview> {
  const pid = String(patient.id ?? "");
  const [covBundle, acctBundle] = await Promise.all([
    fhir.searchCoverage(pid),
    fhir.searchAccounts(pid),
  ]);
  const coverages = bundleResources(covBundle) as Parameters<
    typeof toPreview
  >[1];
  const accounts = bundleResources(acctBundle) as Parameters<
    typeof toPreview
  >[2][];
  const account = accounts[0] ?? null;
  return toPreview(
    patient as Parameters<typeof toPreview>[0],
    coverages,
    account,
    conn.mrnSystem
  );
}

export async function testEpicConnection(clientId: string) {
  const conn = await prisma.clientEpicConnection.findUnique({
    where: { clientId },
  });
  if (!conn?.enabled) {
    throw new Error("Epic connection is not enabled for this client");
  }

  try {
    const fhir = await getClient(conn);
    // Metadata / capability check
    await fhir.get("metadata");
    return { ok: true, message: "Connected to Epic FHIR metadata endpoint" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Connection failed";
    await prisma.clientEpicConnection.update({
      where: { clientId },
      data: { lastError: message.slice(0, 200) },
    });
    throw e;
  }
}

export async function searchEpicPatients(
  clientId: string,
  params: EpicSearchParams
): Promise<EpicPatientPreview[]> {
  const conn = await prisma.clientEpicConnection.findUnique({
    where: { clientId },
  });
  if (!conn?.enabled) {
    throw new Error("Epic connection is not enabled for this client");
  }

  const fhir = await getClient(conn);
  const patients = await loadPatientBundle(fhir, conn, params);
  const previews: EpicPatientPreview[] = [];
  for (const p of patients.slice(0, 25)) {
    previews.push(await enrichPatient(fhir, conn, p));
  }
  return previews;
}

export async function syncEpicPatients(opts: {
  clientId: string;
  userId?: string;
  mode: "DRY_RUN" | "APPLY";
  params: EpicSearchParams;
}) {
  const conn = await prisma.clientEpicConnection.findUnique({
    where: { clientId: opts.clientId },
  });
  if (!conn?.enabled) {
    throw new Error("Epic connection is not enabled for this client");
  }

  const fhir = await getClient(conn);
  const patients = await loadPatientBundle(fhir, conn, opts.params);
  const errors: Array<{ message: string; patientId?: string }> = [];
  const previews: EpicPatientPreview[] = [];
  let syncedCount = 0;

  const openStatus = await prisma.refundStatus.findFirst({
    where: {
      tenant: { clients: { some: { id: opts.clientId } } },
      code: 1,
      active: true,
    },
  });

  for (const raw of patients.slice(0, 50)) {
    try {
      const preview = await enrichPatient(fhir, conn, raw);
      previews.push(preview);

      if (opts.mode !== "APPLY") continue;

      const pid = String(raw.id ?? "");
      const [covBundle, acctBundle] = await Promise.all([
        fhir.searchCoverage(pid),
        fhir.searchAccounts(pid),
      ]);
      const coverages = bundleResources(covBundle);
      const accounts = bundleResources(acctBundle);
      const mapped = mapEpicPatientToAccount(
        raw as Parameters<typeof mapEpicPatientToAccount>[0],
        coverages as Parameters<typeof mapEpicPatientToAccount>[1],
        (accounts[0] as Parameters<typeof mapEpicPatientToAccount>[2]) ?? null,
        conn.mrnSystem
      );

      const existing =
        (mapped.epicPatientFhirId &&
          (await prisma.account.findFirst({
            where: {
              clientId: opts.clientId,
              epicPatientFhirId: mapped.epicPatientFhirId,
            },
          }))) ||
        (await prisma.account.findFirst({
          where: {
            clientId: opts.clientId,
            patientId: mapped.patientId,
          },
        }));

      if (existing) {
        await prisma.account.update({
          where: { id: existing.id },
          data: {
            ...mapped,
            // Preserve financial columns from prior import/EHR feed
            totalBilledCharges: existing.totalBilledCharges,
            patientAccountBalance: existing.patientAccountBalance,
            totalNetPmts: existing.totalNetPmts,
            netAdminOtherAdj: existing.netAdminOtherAdj,
            netContractualAdj: existing.netContractualAdj,
            netPgp: existing.netPgp,
            eraCharges: existing.eraCharges,
            eraTotal: existing.eraTotal,
            ptRepEra: existing.ptRepEra,
            netSecondaryPayment: existing.netSecondaryPayment,
            charityWo: existing.charityWo,
          },
        });
      } else {
        await prisma.account.create({
          data: {
            clientId: opts.clientId,
            ...mapped,
            refundStatusId: openStatus?.id ?? null,
          },
        });
      }
      syncedCount++;
    } catch (e) {
      errors.push({
        message: e instanceof Error ? e.message : "Sync failed",
        patientId: String(raw.id ?? ""),
      });
    }
  }

  const run = await prisma.epicSyncRun.create({
    data: {
      clientId: opts.clientId,
      userId: opts.userId,
      mode: opts.mode,
      status: "COMPLETED",
      query: JSON.stringify(opts.params),
      matchedCount: previews.length,
      syncedCount: opts.mode === "APPLY" ? syncedCount : 0,
      errorCount: errors.length,
      errorsJson: errors,
    },
  });

  return {
    runId: run.id,
    matchedCount: previews.length,
    syncedCount: opts.mode === "APPLY" ? syncedCount : 0,
    errorCount: errors.length,
    previews,
    errors,
  };
}

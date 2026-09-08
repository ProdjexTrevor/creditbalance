import { normalizeFhirBase } from "./config.js";

export type FhirBundle<T = unknown> = {
  resourceType: "Bundle";
  type?: string;
  total?: number;
  entry?: Array<{ resource: T }>;
  link?: Array<{ relation: string; url: string }>;
};

export class EpicFhirClient {
  constructor(
    private fhirBaseUrl: string,
    private accessToken: string
  ) {}

  private url(path: string, params?: Record<string, string>): string {
    const base = normalizeFhirBase(this.fhirBaseUrl);
    const pathPart = path.replace(/^\//, "");
    const u = new URL(pathPart, base);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null && String(v).trim() !== "") {
          u.searchParams.set(k, String(v).trim());
        }
      }
    }
    return u.toString();
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const res = await fetch(this.url(path, params), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/fhir+json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = "";
      try {
        const body = JSON.parse(text) as {
          issue?: Array<{ diagnostics?: string; code?: string }>;
          resourceType?: string;
        };
        detail =
          body.issue?.map((i) => i.diagnostics || i.code).filter(Boolean).join("; ") ||
          text.slice(0, 300);
      } catch {
        detail = text.slice(0, 300);
      }
      const hint =
        res.status === 403
          ? " In Epic, add R4 Search APIs: Patient.Search, Coverage.Search (Patient Insurance Information), Account.Search (Premium Billing)."
          : res.status === 400 && /required/i.test(detail)
            ? " Epic requires a patient id on Coverage/Account search. Also enable Coverage.Search (Patient Insurance Information) R4 — not only Outside Record / STU3."
            : "";
      throw new Error(
        `FHIR ${path} failed (${res.status})${detail ? `: ${detail}` : ""}.${hint}`
      );
    }
    return JSON.parse(text) as T;
  }

  async searchPatients(opts: {
    family?: string;
    given?: string;
    birthdate?: string;
    identifier?: string;
  }) {
    const params: Record<string, string> = {};
    if (opts.family) params.family = opts.family;
    if (opts.given) params.given = opts.given;
    if (opts.birthdate) params.birthdate = opts.birthdate;
    if (opts.identifier) params.identifier = opts.identifier;
    return this.get<FhirBundle>("Patient", params);
  }

  async readPatient(id: string) {
    return this.get<Record<string, unknown>>(`Patient/${id}`);
  }

  async searchCoverage(patientFhirId: string) {
    const id = patientFhirId.replace(/^Patient\//i, "").trim();
    if (!id) {
      return emptyBundle();
    }
    // Epic Coverage.Search (Patient Insurance Information) requires `patient`.
    return this.get<FhirBundle>("Coverage", { patient: id });
  }

  async searchAccounts(patientFhirId: string) {
    const id = patientFhirId.replace(/^Patient\//i, "").trim();
    if (!id) {
      return emptyBundle();
    }
    return this.get<FhirBundle>("Account", { patient: id });
  }
}

function emptyBundle(): FhirBundle {
  return { resourceType: "Bundle", type: "searchset", total: 0, entry: [] };
}

export function bundleResources<T>(bundle: FhirBundle<T>): T[] {
  return (bundle.entry ?? []).map((e) => e.resource).filter(Boolean);
}

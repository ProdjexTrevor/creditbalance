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
    const u = new URL(path.replace(/^\//, ""), base);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) u.searchParams.set(k, v);
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
      throw new Error(`FHIR ${path} failed (${res.status})`);
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
    return this.get<FhirBundle>("Coverage", {
      patient: patientFhirId,
    });
  }

  async searchAccounts(patientFhirId: string) {
    return this.get<FhirBundle>("Account", {
      patient: patientFhirId,
    });
  }
}

export function bundleResources<T>(bundle: FhirBundle<T>): T[] {
  return (bundle.entry ?? []).map((e) => e.resource).filter(Boolean);
}

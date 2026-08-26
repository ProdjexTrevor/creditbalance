/** Epic FHIR sandbox defaults — production uses per-customer URLs from open.epic.com */
export const EPIC_SANDBOX = {
  fhirBaseUrl:
    "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/",
  tokenUrl:
    "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token",
  authorizeUrl:
    "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize",
  /** Common sandbox MRN system (varies by customer in production) */
  defaultMrnSystem:
    "urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.14",
  defaultScopes:
    "system/Patient.read system/Coverage.read system/Account.read",
} as const;

export type EpicConnectionConfig = {
  enabled: boolean;
  environment: "SANDBOX" | "PRODUCTION";
  fhirBaseUrl: string;
  tokenUrl: string | null;
  epicClientId: string;
  hasPrivateKey: boolean;
  jwkKeyId: string | null;
  mrnSystem: string | null;
  scopes: string;
  lastTokenAt: Date | null;
  lastError: string | null;
};

export function normalizeFhirBase(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export function smartConfigUrl(fhirBase: string): string {
  const base = fhirBase.replace(/\/api\/FHIR\/R4\/?$/i, "");
  return `${base}/.well-known/smart-configuration`;
}

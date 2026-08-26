import { URL } from "url";
import { isIP } from "net";
import { EPIC_SANDBOX } from "./config.js";

const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  "fhir.epic.com",
  "open.epic.com",
  "epic.com",
];

function allowedHostSuffixes(): string[] {
  const extra = (process.env.EPIC_ALLOWED_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_HOST_SUFFIXES, ...extra];
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host)) return false; // block raw IPs (SSRF to internal)
  return allowedHostSuffixes().some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/** Validate Epic FHIR / token URLs — HTTPS only, allowlisted hosts. */
export function assertSafeEpicUrl(raw: string, label = "URL"): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid ${label}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials`);
  }
  if (!hostAllowed(parsed.hostname)) {
    throw new Error(
      `${label} host is not allowed. Use Epic domains or set EPIC_ALLOWED_HOSTS.`
    );
  }
  return parsed;
}

export function assertSafeEpicEndpoints(fhirBaseUrl: string, tokenUrl?: string | null) {
  assertSafeEpicUrl(fhirBaseUrl, "FHIR base URL");
  if (tokenUrl?.trim()) {
    assertSafeEpicUrl(tokenUrl.trim(), "Token URL");
  }
}

export function sandboxTokenUrl(): string {
  return EPIC_SANDBOX.tokenUrl;
}

import { SignJWT, importPKCS8 } from "jose";
import { randomUUID } from "crypto";
import { decryptAtRest } from "../lib/secretCrypto.js";
import { normalizeFhirBase, smartConfigUrl } from "./config.js";
import { assertSafeEpicUrl } from "./urlAllowlist.js";

export type EpicTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

type ConnectionRow = {
  epicClientId: string;
  tokenUrl: string | null;
  fhirBaseUrl: string;
  privateKeyEnc: string | null;
  jwkKeyId: string | null;
  scopes: string;
};

let discoveryCache: Map<string, { tokenUrl: string; expires: number }> = new Map();

async function resolveTokenUrl(conn: ConnectionRow): Promise<string> {
  if (conn.tokenUrl?.trim()) {
    const u = assertSafeEpicUrl(conn.tokenUrl.trim(), "Token URL");
    return u.toString();
  }
  assertSafeEpicUrl(conn.fhirBaseUrl, "FHIR base URL");
  const base = normalizeFhirBase(conn.fhirBaseUrl);
  const cached = discoveryCache.get(base);
  if (cached && cached.expires > Date.now()) return cached.tokenUrl;

  const url = smartConfigUrl(base);
  assertSafeEpicUrl(url, "SMART discovery URL");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Could not discover Epic token endpoint (${res.status}). Set Token URL explicitly.`
    );
  }
  const data = (await res.json()) as { token_endpoint?: string };
  if (!data.token_endpoint) {
    throw new Error("SMART configuration missing token_endpoint");
  }
  const tokenUrl = assertSafeEpicUrl(data.token_endpoint, "Discovered token URL").toString();
  discoveryCache.set(base, { tokenUrl, expires: Date.now() + 3600_000 });
  return tokenUrl;
}

async function buildClientAssertion(
  clientId: string,
  tokenUrl: string,
  privateKeyPem: string,
  keyId?: string | null
): Promise<string> {
  const key = await importPKCS8(privateKeyPem, "RS384");
  const jwt = await new SignJWT({})
    .setProtectedHeader({
      alg: "RS384",
      typ: "JWT",
      ...(keyId ? { kid: keyId } : {}),
    })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(tokenUrl)
    .setJti(randomUUID())
    .setExpirationTime("4m")
    .setIssuedAt()
    .sign(key);
  return jwt;
}

/** SMART Backend Services: client_credentials + JWT assertion */
export async function fetchEpicAccessToken(
  conn: ConnectionRow
): Promise<EpicTokenResponse> {
  if (!conn.privateKeyEnc) {
    throw new Error(
      "Epic private key not configured. Register your app at fhir.epic.com and upload the RSA private key PEM."
    );
  }

  const privateKeyPem = decryptAtRest(conn.privateKeyEnc);
  const tokenUrl = await resolveTokenUrl(conn);

  const assertion = await buildClientAssertion(
    conn.epicClientId,
    tokenUrl,
    privateKeyPem,
    conn.jwkKeyId
  );

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
    scope: conn.scopes,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Epic token request failed (${res.status})`);
  }
  const text = await res.text();

  return JSON.parse(text) as EpicTokenResponse;
}

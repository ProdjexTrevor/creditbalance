import { SignJWT, importPKCS8 } from "jose";
import { randomUUID } from "crypto";
import { decryptAtRest } from "../lib/secretCrypto.js";
import { normalizeFhirBase, smartConfigUrl } from "./config.js";
import { assertSafeEpicUrl } from "./urlAllowlist.js";
import { loadSandboxPrivateKeyPem } from "./sandboxKey.js";

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

function resolvePrivateKeyPem(conn: ConnectionRow): string {
  if (conn.privateKeyEnc) {
    return decryptAtRest(conn.privateKeyEnc);
  }
  const sandbox = loadSandboxPrivateKeyPem();
  if (sandbox) return sandbox;
  throw new Error(
    "Epic private key not configured. In Admin → Epic click “Fill sandbox key + URLs”, enter your Client ID, then Save before Test connection."
  );
}

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
  // Epic is picky: audience must match the token endpoint exactly (no trailing slash).
  const audience = tokenUrl.replace(/\/+$/, "");
  const jwt = await new SignJWT({})
    .setProtectedHeader({
      alg: "RS384",
      typ: "JWT",
      ...(keyId ? { kid: keyId } : {}),
    })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(audience)
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
  const clientId = conn.epicClientId?.trim();
  if (!clientId) {
    throw new Error("Epic client ID is missing. Paste your Non-Production Client ID and Save.");
  }

  const privateKeyPem = resolvePrivateKeyPem(conn);
  const tokenUrl = (await resolveTokenUrl(conn)).replace(/\/+$/, "");
  const kid = conn.jwkKeyId?.trim() || "credit-balance-sandbox";

  const assertion = await buildClientAssertion(
    clientId,
    tokenUrl,
    privateKeyPem,
    kid
  );

  const scopes = (conn.scopes || "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
  });
  // Do NOT send client_id in the body — Epic sandbox often returns invalid_client if present.
  if (scopes) body.set("scope", scopes);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text) as {
        error?: string;
        error_description?: string;
        message?: string;
      };
      detail =
        [parsed.error, parsed.error_description || parsed.message]
          .filter(Boolean)
          .join(": ") || detail;
    } catch {
      /* keep raw */
    }
    const hints =
      detail.includes("invalid_client")
        ? " Use the Non-Production (sandbox) Client ID — not Production. " +
          "Re-save JWK Set URL in Epic as exactly " +
          "https://credit-balnace-api.vercel.app/.well-known/jwks.json " +
          "(note spelling balnace). Epic can take minutes–hours to pick up JWKS changes."
        : " Confirm Non-Production Client ID, JWK Set URL, and sandbox APIs " +
          "(Patient/Coverage/Account read) are enabled.";
    throw new Error(
      `Epic token request failed (${res.status}): ${detail || "no body"}.${hints}`
    );
  }

  return JSON.parse(text) as EpicTokenResponse;
}

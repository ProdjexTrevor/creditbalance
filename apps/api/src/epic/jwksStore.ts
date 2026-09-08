import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const jwksPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "epic-jwks",
  "sandbox-jwks.json"
);

let cached: { keys: unknown[] } | null = null;

/** Public JWKS for Epic to fetch (no auth). */
export function getSandboxJwks(): { keys: unknown[] } {
  if (cached) return cached;
  if (process.env.EPIC_JWKS_JSON?.trim()) {
    cached = JSON.parse(process.env.EPIC_JWKS_JSON) as { keys: unknown[] };
    return cached;
  }
  if (!existsSync(jwksPath)) {
    return { keys: [] };
  }
  cached = JSON.parse(readFileSync(jwksPath, "utf8")) as { keys: unknown[] };
  return cached;
}

export function getPublicJwksUrl(reqHost?: string): string {
  if (process.env.EPIC_JWKS_PUBLIC_URL?.trim()) {
    return process.env.EPIC_JWKS_PUBLIC_URL.trim();
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/.well-known/jwks.json`;
  }
  if (reqHost) {
    const host = reqHost.replace(/\/$/, "");
    const base = host.startsWith("http") ? host : `https://${host}`;
    return `${base}/.well-known/jwks.json`;
  }
  return "https://credit-balnace-api.vercel.app/.well-known/jwks.json";
}

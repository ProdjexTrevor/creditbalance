/**
 * Export public PEM from sandbox private key (no openssl required).
 * pnpm exec tsx scripts/export-epic-public-pem.ts
 */
import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "epic-jwks");
const pem = readFileSync(join(dir, "sandbox-private.pem"), "utf8");
const publicPem = createPublicKey(createPrivateKey(pem)).export({
  type: "spki",
  format: "pem",
}) as string;
writeFileSync(join(dir, "sandbox-public.pem"), publicPem);
console.log(JSON.stringify({ ok: true, bytes: publicPem.length }));

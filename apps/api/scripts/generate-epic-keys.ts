/**
 * One-time generator: writes sandbox JWKS (public, safe) + private PEM (gitignored).
 * Run: pnpm exec tsx scripts/generate-epic-keys.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateEpicKeyPair, DEFAULT_EPIC_KID } from "../src/epic/keys.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "epic-jwks");
mkdirSync(dir, { recursive: true });

const pair = await generateEpicKeyPair(DEFAULT_EPIC_KID);

writeFileSync(
  join(dir, "sandbox-jwks.json"),
  JSON.stringify(pair.jwks, null, 2) + "\n",
  "utf8"
);
writeFileSync(join(dir, "sandbox-private.pem"), pair.privateKeyPem + "\n", "utf8");
writeFileSync(
  join(dir, "README.txt"),
  [
    "sandbox-jwks.json  — PUBLIC. Served at /.well-known/jwks.json — safe to commit.",
    "sandbox-private.pem — SECRET. Paste into Admin → Epic. Do NOT commit.",
    `kid: ${pair.kid}`,
    "",
    "Epic app form → Non-Production JWK Set URL:",
    "  https://credit-balnace-api.vercel.app/.well-known/jwks.json",
    "",
  ].join("\n"),
  "utf8"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      kid: pair.kid,
      jwksPath: "apps/api/epic-jwks/sandbox-jwks.json",
      privatePath: "apps/api/epic-jwks/sandbox-private.pem",
      epicJwksUrl: "https://credit-balnace-api.vercel.app/.well-known/jwks.json",
    },
    null,
    2
  )
);

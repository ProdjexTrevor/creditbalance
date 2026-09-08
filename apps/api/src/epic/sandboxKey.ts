import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_EPIC_KID } from "./keys.js";

/** Load the bundled / env sandbox private PEM (never log this). */
export function loadSandboxPrivateKeyPem(): string | null {
  const fromEnv = process.env.EPIC_SANDBOX_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (fromEnv?.includes("BEGIN") && fromEnv.includes("PRIVATE KEY")) {
    return fromEnv;
  }
  const pemPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "epic-jwks",
    "sandbox-private.pem"
  );
  if (existsSync(pemPath)) {
    const pem = readFileSync(pemPath, "utf8").trim();
    if (pem.includes("BEGIN") && pem.includes("PRIVATE KEY")) return pem;
  }
  return null;
}

export function sandboxKid(): string {
  return DEFAULT_EPIC_KID;
}

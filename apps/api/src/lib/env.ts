/**
 * Boot-time environment validation.
 * Production refuses weak/missing secrets. Development allows placeholders with a warning.
 */

const WEAK = new Set([
  "",
  "dev-secret",
  "dev-secret-change-me",
  "dev-secret-local-only-do-not-use",
  "dev-enc-local-only-do-not-use",
  "change-me",
  "change-me-in-production",
  "change-me-totp",
  "change-me-epic",
  "password",
  "secret",
]);

function isWeak(value: string | undefined): boolean {
  if (!value || value.trim().length < 16) return true;
  return WEAK.has(value.trim().toLowerCase());
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL);
}

/** Throws if secrets are missing/weak. Does not call process.exit (safe for serverless). */
export function assertSafeEnv(): void {
  const jwt = process.env.JWT_SECRET;
  const enc =
    process.env.TOTP_ENCRYPTION_KEY ||
    process.env.EPIC_ENCRYPTION_KEY ||
    process.env.JWT_SECRET;

  const problems: string[] = [];

  if (!jwt || isWeak(jwt)) {
    problems.push("JWT_SECRET is missing or too weak (min 16 chars, not a placeholder)");
  }
  if (!enc || isWeak(enc)) {
    problems.push(
      "TOTP_ENCRYPTION_KEY (or EPIC_ENCRYPTION_KEY) is missing or too weak"
    );
  }
  if (
    process.env.TOTP_ENCRYPTION_KEY &&
    process.env.JWT_SECRET &&
    process.env.TOTP_ENCRYPTION_KEY === process.env.JWT_SECRET
  ) {
    problems.push(
      "TOTP_ENCRYPTION_KEY must differ from JWT_SECRET (do not share keys)"
    );
  }

  if (problems.length === 0) return;

  const message = problems.join("; ");

  if (isProduction() || process.env.STRICT_SECRETS === "1") {
    if (isVercelRuntime()) {
      throw new Error(message);
    }
    console.error("Refusing to start — insecure configuration:");
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }

  console.warn("⚠ Weak or missing secrets (OK for local demo only):");
  for (const p of problems) console.warn(`  • ${p}`);
  console.warn("  Set strong JWT_SECRET + TOTP_ENCRYPTION_KEY before any real data.");
}

export function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (isProduction()) throw new Error("JWT_SECRET is required");
    return "dev-secret-local-only-do-not-use";
  }
  return s;
}

export function encryptionSecret(): string {
  const s =
    process.env.TOTP_ENCRYPTION_KEY ||
    process.env.EPIC_ENCRYPTION_KEY ||
    process.env.JWT_SECRET;
  if (!s) {
    if (isProduction()) throw new Error("TOTP_ENCRYPTION_KEY is required");
    return "dev-enc-local-only-do-not-use";
  }
  return s;
}

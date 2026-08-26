import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { generateSecret, generateSync, generateURI, verifySync } from "otplib";
import { decryptAtRest, encryptAtRest } from "./secretCrypto.js";

const ISSUER = "Credit Balance";

/** Encrypt TOTP secret at rest (AES-256-GCM). */
export function encryptSecret(plain: string): string {
  return encryptAtRest(plain);
}

export function decryptSecret(payload: string): string {
  return decryptAtRest(payload);
}

export function createTotpSecret(): string {
  return generateSecret();
}

export function totpUri(secret: string, email: string, tenantSlug: string): string {
  return generateURI({
    issuer: ISSUER,
    label: `${tenantSlug}:${email}`,
    secret,
  });
}

export function verifyTotpCode(secret: string, token: string): boolean {
  const cleaned = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const result = verifySync({ secret, token: cleaned });
    return Boolean(result && result.valid);
  } catch {
    return false;
  }
}

/** Dev/test helper */
export function currentTotpCode(secret: string): string {
  return generateSync({ secret });
}

const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = "";
    const bytes = randomBytes(10);
    for (let j = 0; j < 10; j++) {
      code += BACKUP_ALPHABET[bytes[j] % BACKUP_ALPHABET.length];
      if (j === 4) code += "-";
    }
    codes.push(code);
  }
  return codes;
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(normalizeBackup(c), 10)));
}

function normalizeBackup(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Consume a matching backup code. Returns remaining hashes or null if no match.
 */
export async function consumeBackupCode(
  hashes: string[] | null | undefined,
  code: string
): Promise<string[] | null> {
  if (!hashes?.length) return null;
  const normalized = normalizeBackup(code);
  if (normalized.length < 8) return null;
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalized, hashes[i])) {
      return hashes.filter((_, idx) => idx !== i);
    }
  }
  return null;
}

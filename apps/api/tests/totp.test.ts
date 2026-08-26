/**
 * TC: TOTP helpers
 * Catalog: docs/TEST_CASES.md → TC-AUTH-*
 */
import { describe, expect, it } from "vitest";
import {
  consumeBackupCode,
  createTotpSecret,
  currentTotpCode,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  hashBackupCodes,
  verifyTotpCode,
} from "../src/lib/totp.js";

describe("totp crypto + verify", () => {
  it("TC-AUTH-010: encrypt/decrypt secret round-trip", () => {
    const secret = createTotpSecret();
    const enc = encryptSecret(secret);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("TC-AUTH-011: current code verifies", () => {
    const secret = createTotpSecret();
    const code = currentTotpCode(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });

  it("TC-AUTH-012: backup code consumes once", async () => {
    const codes = generateBackupCodes(2);
    const hashes = await hashBackupCodes(codes);
    const after = await consumeBackupCode(hashes, codes[0]);
    expect(after).not.toBeNull();
    expect(after).toHaveLength(1);
    const again = await consumeBackupCode(after, codes[0]);
    expect(again).toBeNull();
    const other = await consumeBackupCode(after, codes[1]);
    expect(other).toHaveLength(0);
  });
});

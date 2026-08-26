/**
 * TC: Field allowlist integrity
 * Catalog: docs/TEST_CASES.md → TC-FIELD-*
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_FIELDS,
  FIELD_OPTIONS,
  isAccountField,
  isVirtualField,
} from "../src/engine/fields.js";

describe("ACCOUNT_FIELDS allowlist", () => {
  it("TC-FIELD-001: core financial columns are non-virtual", () => {
    expect(isAccountField("totalBilledCharges")).toBe(true);
    expect(isVirtualField("totalBilledCharges")).toBe(false);
  });

  it("TC-FIELD-002: payer category fields are virtual", () => {
    expect(isVirtualField("primaryPayerCategory")).toBe(true);
    expect(isVirtualField("anyPayerCategory")).toBe(true);
    expect(isVirtualField("payerUnmapped")).toBe(true);
  });

  it("TC-FIELD-003: FIELD_OPTIONS mirrors ACCOUNT_FIELDS keys", () => {
    const keys = Object.keys(ACCOUNT_FIELDS).sort();
    const opt = FIELD_OPTIONS.map((f) => f.value).sort();
    expect(opt).toEqual(keys);
  });

  it("TC-FIELD-004: free-form SQL columns are not allowlisted", () => {
    expect(isAccountField("DROP TABLE accounts")).toBe(false);
    expect(isAccountField("passwordHash")).toBe(false);
  });
});

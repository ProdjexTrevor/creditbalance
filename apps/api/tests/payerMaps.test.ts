/**
 * TC: Payer map enrichment
 * Catalog: docs/TEST_CASES.md → TC-PAYER-*
 */
import { describe, expect, it } from "vitest";
import {
  buildPayerLookup,
  enrichAccountWithPayerMaps,
} from "../src/engine/payerMaps.js";
import { mapRow } from "./helpers.js";

describe("enrichAccountWithPayerMaps", () => {
  const lookup = buildPayerLookup([
    mapRow("C95", "medicaid", "MEDICAID PLAN ALPHA"),
    mapRow("N90", "medicare"),
    mapRow("COMM1", "commercial"),
  ]);

  it("TC-PAYER-001: maps primary plan code to category", () => {
    const e = enrichAccountWithPayerMaps(
      { planCode1: "C95", primaryInsurance: "MEDICAID PLAN ALPHA" },
      lookup
    );
    expect(e.primaryPayerCategory).toBe("medicaid");
    expect(e.payerMapped).toBe("true");
    expect(e.payerUnmapped).toBe("false");
  });

  it("TC-PAYER-002: unmapped plan sets payerUnmapped", () => {
    const e = enrichAccountWithPayerMaps(
      { planCode1: "COMM2", primaryInsurance: "COMMERCIAL AETNA SAMPLE" },
      lookup
    );
    expect(e.primaryPayerCategory).toBeNull();
    expect(e.payerMapped).toBe("false");
    expect(e.payerUnmapped).toBe("true");
  });

  it("TC-PAYER-003: match by plan name when code missing from map", () => {
    // Name-only map then resolve via primaryInsurance
    const nameLookup = buildPayerLookup([
      mapRow("", "medicaid", "MEDICAID PLAN ALPHA"),
    ]);
    // mapRow with empty code still sets byName if name provided — empty code skipped in byCode
    const e = enrichAccountWithPayerMaps(
      { planCode1: "UNKNOWN", primaryInsurance: "MEDICAID PLAN ALPHA" },
      nameLookup
    );
    expect(e.primaryPayerCategory).toBe("medicaid");
  });

  it("TC-PAYER-004: any payer categories dedupe across slots", () => {
    const e = enrichAccountWithPayerMaps(
      {
        planCode1: "C95",
        planCode2: "N90",
        planCode3: "C95",
      },
      lookup
    );
    expect(e.payerCategoryCodes.sort()).toEqual(["medicaid", "medicare"].sort());
  });

  it("TC-PAYER-005: no plan yields not unmapped", () => {
    const e = enrichAccountWithPayerMaps({}, lookup);
    expect(e.payerUnmapped).toBe("false");
    expect(e.payerMapped).toBe("false");
  });
});

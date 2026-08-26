/**
 * TC: Rule engine evaluation (hierarchy conditions)
 * Catalog: docs/TEST_CASES.md → TC-RULE-*
 */
import { describe, expect, it } from "vitest";
import { evaluateCondition, evaluateRule } from "../src/engine/compiler.js";
import { cond, rule, RuleOperator } from "./helpers.js";

describe("evaluateCondition — numeric", () => {
  it("TC-RULE-001: LTE matches zero charges", () => {
    const account = { totalBilledCharges: 0 };
    expect(
      evaluateCondition(account, cond("totalBilledCharges", RuleOperator.LTE, 0))
    ).toBe(true);
  });

  it("TC-RULE-002: ABS_EQ_FIELD admin adj equals charges", () => {
    const account = { totalBilledCharges: 500, netAdminOtherAdj: -500 };
    expect(
      evaluateCondition(
        account,
        cond("totalBilledCharges", RuleOperator.ABS_EQ_FIELD, null, "netAdminOtherAdj")
      )
    ).toBe(true);
  });

  it("TC-RULE-003: GT_FIELD EMR charges > ERA charges", () => {
    const account = { totalBilledCharges: 1200, eraCharges: 1000 };
    expect(
      evaluateCondition(
        account,
        cond("totalBilledCharges", RuleOperator.GT_FIELD, null, "eraCharges")
      )
    ).toBe(true);
  });
});

describe("evaluateCondition — payer category virtuals", () => {
  it("TC-RULE-010: anyPayerCategory IN medicaid", () => {
    const account = {
      payerCategoryCodes: ["medicaid", "commercial"],
      anyPayerCategory: "medicaid",
    };
    expect(
      evaluateCondition(
        account,
        cond("anyPayerCategory", RuleOperator.IN, ["medicaid"])
      )
    ).toBe(true);
  });

  it("TC-RULE-011: anyPayerCategory IN does not match when code absent", () => {
    const account = { payerCategoryCodes: ["medicare"] };
    expect(
      evaluateCondition(
        account,
        cond("anyPayerCategory", RuleOperator.IN, ["medicaid"])
      )
    ).toBe(false);
  });

  it("TC-RULE-012: payerUnmapped EQ true", () => {
    const account = { payerUnmapped: "true", payerMapped: "false" };
    expect(
      evaluateCondition(account, cond("payerUnmapped", RuleOperator.EQ, "true"))
    ).toBe(true);
  });

  it("TC-RULE-013: primaryPayerCategory EQ is case-insensitive", () => {
    const account = { primaryPayerCategory: "Medicaid" };
    expect(
      evaluateCondition(
        account,
        cond("primaryPayerCategory", RuleOperator.EQ, "medicaid")
      )
    ).toBe(true);
  });
});

describe("evaluateRule — hierarchy semantics", () => {
  it("TC-RULE-020: onlyUnclassified skips accounts that already have a reason", () => {
    const r = rule("zero charges", [
      cond("totalBilledCharges", RuleOperator.LTE, 0),
    ]);
    expect(evaluateRule({ totalBilledCharges: 0, refundReasonId: null }, r)).toBe(
      true
    );
    expect(
      evaluateRule({ totalBilledCharges: 0, refundReasonId: "already" }, r)
    ).toBe(false);
  });

  it("TC-RULE-021: all conditions in a group must match (AND)", () => {
    const r = rule("medicaid + patient pay", [
      cond("anyPayerCategory", RuleOperator.IN, ["medicaid"]),
      cond("netPgp", RuleOperator.ABS_GT, 0),
    ]);
    expect(
      evaluateRule(
        {
          refundReasonId: null,
          payerCategoryCodes: ["medicaid"],
          netPgp: -40,
        },
        r
      )
    ).toBe(true);
    expect(
      evaluateRule(
        {
          refundReasonId: null,
          payerCategoryCodes: ["medicaid"],
          netPgp: 0,
        },
        r
      )
    ).toBe(false);
  });

  it("TC-RULE-022: rejects unknown field via evaluateCondition", () => {
    expect(
      evaluateCondition(
        { totalBilledCharges: 1 },
        cond("notARealField", RuleOperator.EQ, 1)
      )
    ).toBe(false);
  });
});

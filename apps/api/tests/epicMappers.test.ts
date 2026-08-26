/**
 * TC: Epic FHIR mappers
 * Catalog: docs/TEST_CASES.md → TC-EPIC-*
 */
import { describe, expect, it } from "vitest";
import {
  extractMrn,
  mapCoveragesToPlans,
  mapEpicPatientToAccount,
  patientName,
  toPreview,
} from "../src/epic/mappers.js";

const MRN_SYSTEM = "urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.14";

describe("Epic FHIR mappers", () => {
  it("TC-EPIC-001: extractMrn prefers configured system", () => {
    const mrn = extractMrn(
      {
        identifier: [
          { system: "other", value: "999" },
          { system: MRN_SYSTEM, value: "203713" },
        ],
      },
      MRN_SYSTEM
    );
    expect(mrn).toBe("203713");
  });

  it("TC-EPIC-002: patientName uses official name", () => {
    const name = patientName({
      name: [
        { given: ["Nick"], family: "Alias", use: "nickname" },
        { given: ["Allison"], family: "Mychart", use: "official" },
      ],
    });
    expect(name).toEqual({ firstName: "Allison", lastName: "Mychart" });
  });

  it("TC-EPIC-003: mapCoveragesToPlans orders by coverage.order", () => {
    const plans = mapCoveragesToPlans([
      {
        status: "active",
        order: 2,
        payor: [{ display: "Secondary Plan" }],
        subscriberId: "SEC1",
      },
      {
        status: "active",
        order: 1,
        payor: [{ display: "Primary Plan" }],
        subscriberId: "PRI1",
      },
    ]);
    expect(plans.primaryInsurance).toBe("Primary Plan");
    expect(plans.planCode1).toBe("PRI1");
    expect(plans.secondaryInsurance).toBe("Secondary Plan");
    expect(plans.planCode2).toBe("SEC1");
  });

  it("TC-EPIC-004: mapEpicPatientToAccount builds account identity", () => {
    const mapped = mapEpicPatientToAccount(
      {
        id: "patient-1",
        identifier: [{ system: MRN_SYSTEM, value: "203713" }],
        name: [{ given: ["Allison"], family: "Mychart", use: "official" }],
      },
      [
        {
          status: "active",
          order: 1,
          payor: [{ display: "Medicaid" }],
          subscriberId: "C95",
        },
      ],
      {
        id: "acct-1",
        status: "active",
        identifier: [{ value: "HAR12345" }],
      },
      MRN_SYSTEM
    );
    expect(mapped.patientId).toBe("203713");
    expect(mapped.accountNumber).toBe("HAR12345");
    expect(mapped.primaryInsurance).toBe("Medicaid");
    expect(mapped.planCode1).toBe("C95");
    expect(mapped.epicPatientFhirId).toBe("patient-1");
    expect(mapped.epicAccountFhirId).toBe("acct-1");
  });

  it("TC-EPIC-005: toPreview exposes UI fields", () => {
    const preview = toPreview(
      {
        id: "patient-1",
        identifier: [{ system: MRN_SYSTEM, value: "203713" }],
        name: [{ given: ["Allison"], family: "Mychart", use: "official" }],
      },
      [{ status: "active", payor: [{ display: "Medicaid" }], subscriberId: "C95" }],
      { id: "acct-1", status: "active", identifier: [{ value: "HAR12345" }] },
      MRN_SYSTEM
    );
    expect(preview).toMatchObject({
      epicPatientFhirId: "patient-1",
      mrn: "203713",
      firstName: "Allison",
      lastName: "Mychart",
      accountNumber: "HAR12345",
      primaryInsurance: "Medicaid",
      planCode1: "C95",
      accountStatus: "active",
    });
  });
});

/**
 * TC: CSV parse + account row mapping
 * Catalog: docs/TEST_CASES.md → TC-IMPORT-*
 */
import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../src/import/csv.js";
import {
  analyzeCsvForMapping,
  headerMapFromColumnMapping,
  resolveMappedRow,
  suggestColumnMapping,
} from "../src/import/accountImporter.js";

describe("parseCsv", () => {
  it("TC-IMPORT-001: parses headers and rows", () => {
    const { headers, rows } = parseCsv(
      "patientId,accountNumber,totalBilledCharges\nP1,A1,100.50\nP2,A2,0\n"
    );
    expect(headers).toEqual([
      "patientId",
      "accountNumber",
      "totalBilledCharges",
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].accountNumber).toBe("A1");
  });

  it("TC-IMPORT-002: handles quoted commas", () => {
    const { rows } = parseCsv('name,note\n"Doe, Jane","owed, pending"\n');
    expect(rows[0].name).toBe("Doe, Jane");
    expect(rows[0].note).toBe("owed, pending");
  });

  it("TC-IMPORT-003: toCsv round-trip header", () => {
    const csv = toCsv(["a", "b"], [{ a: 1, b: "x,y" }]);
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(["a", "b"]);
    expect(parsed.rows[0].b).toBe("x,y");
  });
});

describe("resolveMappedRow", () => {
  function headerMap(entries: Record<string, string>) {
    return new Map(Object.entries(entries));
  }

  it("TC-IMPORT-010: maps canonical financial fields", () => {
    const hm = headerMap({
      patientId: "patientId",
      accountNumber: "accountNumber",
      totalBilledCharges: "totalBilledCharges",
      patientAccountBalance: "patientAccountBalance",
    });
    const r = resolveMappedRow(
      {
        patientId: "P9",
        accountNumber: "A9",
        totalBilledCharges: "1,234.56",
        patientAccountBalance: "(50.00)",
      },
      hm
    );
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.patientId).toBe("P9");
    expect(r.fields.totalBilledCharges).toBe(1234.56);
    expect(r.fields.patientAccountBalance).toBe(-50);
  });

  it("TC-IMPORT-011: fails without ids", () => {
    const r = resolveMappedRow(
      { totalBilledCharges: "10" },
      headerMap({ totalBilledCharges: "totalBilledCharges" })
    );
    expect("error" in r).toBe(true);
  });

  it("TC-IMPORT-012: derives missing patientId from accountNumber", () => {
    const r = resolveMappedRow(
      { accountNumber: "ONLY-ACCT" },
      headerMap({ accountNumber: "accountNumber" })
    );
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.patientId).toBe("ONLY-ACCT");
    expect(r.accountNumber).toBe("ONLY-ACCT");
  });
});

describe("column mapping", () => {
  it("TC-IMPORT-030: suggests mapping from known aliases", () => {
    const suggested = suggestColumnMapping([
      "PatientID",
      "AccountNumber",
      "Charges",
      "Balance",
      "MysteryCol",
    ]);
    expect(suggested.patientId).toBe("PatientID");
    expect(suggested.accountNumber).toBe("AccountNumber");
    expect(suggested.totalBilledCharges).toBe("Charges");
    expect(suggested.patientAccountBalance).toBe("Balance");
    expect(suggested.mysteryField).toBeUndefined();
  });

  it("TC-IMPORT-031: user mapping overrides auto aliases", () => {
    const headers = ["ColA", "ColB", "Dollars"];
    const map = headerMapFromColumnMapping(
      {
        patientId: "ColA",
        accountNumber: "ColB",
        totalBilledCharges: "Dollars",
      },
      headers
    );
    expect(map.get("patientId")).toBe("ColA");
    expect(map.get("totalBilledCharges")).toBe("Dollars");
    const row = resolveMappedRow(
      { ColA: "P1", ColB: "A1", Dollars: "99.5" },
      map
    );
    expect("error" in row).toBe(false);
    if ("error" in row) return;
    expect(row.fields.totalBilledCharges).toBe(99.5);
  });

  it("TC-IMPORT-032: analyzeCsvForMapping returns fields + samples", () => {
    const a = analyzeCsvForMapping(
      "Pat ID,Acct,Charges\nX1,Y1,10\nX2,Y2,20\n"
    );
    expect(a.headers).toEqual(["Pat ID", "Acct", "Charges"]);
    expect(a.rowCount).toBe(2);
    expect(a.sampleRows[0]["Pat ID"]).toBe("X1");
    expect(a.fields.length).toBeGreaterThan(5);
  });
});

/**
 * TC: Epic URL allowlist (SSRF guard)
 */
import { describe, expect, it } from "vitest";
import { assertSafeEpicUrl } from "../src/epic/urlAllowlist.js";

describe("Epic URL allowlist", () => {
  it("allows Epic sandbox HTTPS hosts", () => {
    expect(() =>
      assertSafeEpicUrl(
        "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/"
      )
    ).not.toThrow();
  });

  it("rejects HTTP", () => {
    expect(() => assertSafeEpicUrl("http://fhir.epic.com/x")).toThrow(/HTTPS/);
  });

  it("rejects private / raw IP hosts", () => {
    expect(() => assertSafeEpicUrl("https://127.0.0.1/metadata")).toThrow(
      /not allowed/
    );
  });

  it("rejects unrelated hosts", () => {
    expect(() => assertSafeEpicUrl("https://evil.example/token")).toThrow(
      /not allowed/
    );
  });
});

import { describe, expect, it } from "vitest";
import { formatLeadName } from "./lead-name";

describe("formatLeadName", () => {
  it("omits missing name parts instead of rendering null", () => {
    expect(formatLeadName({ firstName: null, lastName: "Test" })).toBe("Test");
    expect(formatLeadName({ firstName: "null", lastName: "Test" })).toBe("Test");
    expect(formatLeadName("null Test")).toBe("Test");
  });

  it("trims available name parts", () => {
    expect(formatLeadName({ firstName: "  Asha ", lastName: " Sharma  " })).toBe("Asha Sharma");
  });
});

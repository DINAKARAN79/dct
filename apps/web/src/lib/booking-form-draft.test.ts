import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOOKING_FORM_DRAFT_TTL_MS,
  readBookingFormDraft,
  removeBookingFormDraft,
  saveBookingFormDraft,
} from "./booking-form-draft";

const isStringRecord = (value: unknown): value is Record<string, string> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.values(value).every((item) => typeof item === "string");

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("booking form drafts", () => {
  it("restores a draft for the matching lead and quotation within the session", () => {
    const draft = { applicantName: "Asha", aadhaarNumber: "123456789012" };

    expect(saveBookingFormDraft("lead/a", "quotation-a", draft, 1000)).toBe(true);
    expect(readBookingFormDraft("lead/a", "quotation-a", isStringRecord, 1000 + 30 * 60 * 1000)).toEqual(draft);
    expect(readBookingFormDraft("lead-b", "quotation-a", isStringRecord, 2000)).toBeNull();
  });

  it("removes expired or malformed drafts instead of restoring them", () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const draft = { applicantName: "Asha" };
    saveBookingFormDraft("lead-a", "quotation-a", draft, 1000);
    expect(readBookingFormDraft("lead-a", "quotation-a", isStringRecord, 1000 + BOOKING_FORM_DRAFT_TTL_MS + 1)).toBeNull();

    window.sessionStorage.setItem("crm-booking-form-draft:lead-a:quotation-a", "{");
    expect(readBookingFormDraft("lead-a", "quotation-a", isStringRecord, 2000)).toBeNull();
    expect(window.sessionStorage.getItem("crm-booking-form-draft:lead-a:quotation-a")).toBeNull();
    expect(logError).toHaveBeenCalledOnce();
  });

  it("removes a draft after successful booking", () => {
    saveBookingFormDraft("lead-a", "quotation-a", { applicantName: "Asha" });

    removeBookingFormDraft("lead-a", "quotation-a");

    expect(readBookingFormDraft("lead-a", "quotation-a", isStringRecord)).toBeNull();
  });
});

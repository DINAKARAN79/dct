export const BOOKING_FORM_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

function storageKey(leadId: string, quotationId: string) {
  return `crm-booking-form-draft:${encodeURIComponent(leadId)}:${encodeURIComponent(quotationId)}`;
}

export function saveBookingFormDraft<T>(leadId: string, quotationId: string, data: T, now = Date.now()) {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(storageKey(leadId, quotationId), JSON.stringify({ savedAt: now, data }));
    return true;
  } catch (error) {
    console.error("Could not save booking form draft:", error);
    return false;
  }
}

export function readBookingFormDraft<T>(
  leadId: string,
  quotationId: string,
  isDraft: (value: unknown) => value is T,
  now = Date.now(),
): T | null {
  if (typeof window === "undefined") return null;
  const key = storageKey(leadId, quotationId);
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(key);
  } catch (error) {
    console.error("Could not read booking form draft:", error);
    return null;
  }
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as { savedAt?: unknown; data?: unknown };
    const isFresh = typeof stored.savedAt === "number" &&
      Number.isFinite(stored.savedAt) &&
      stored.savedAt <= now &&
      now - stored.savedAt <= BOOKING_FORM_DRAFT_TTL_MS;
    if (!isFresh || !isDraft(stored.data)) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return stored.data;
  } catch (error) {
    console.error("Could not parse booking form draft:", error);
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function removeBookingFormDraft(leadId: string, quotationId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(leadId, quotationId));
  } catch (error) {
    console.error("Could not remove booking form draft:", error);
  }
}

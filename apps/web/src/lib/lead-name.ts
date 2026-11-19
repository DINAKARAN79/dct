type LeadNameParts = {
  firstName?: string | null;
  lastName?: string | null;
};

export function formatLeadName(lead?: LeadNameParts | string | null): string {
  const parts = typeof lead === "string"
    ? lead.split(/\s+/)
    : [lead?.firstName, lead?.lastName];
  return parts
    .filter((part): part is string => (
      typeof part === "string"
      && part.trim().length > 0
      && !["null", "undefined"].includes(part.trim().toLowerCase())
    ))
    .map((part) => part.trim())
    .join(" ");
}

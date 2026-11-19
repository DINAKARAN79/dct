import type { LeadDuplicateInput } from '../services/leadDuplicateDetection';

export function getCPPortalLeadClassification(leadType: string | null | undefined) {
  const isExisting = leadType === 'ADDITIONAL';
  return {
    type: isExisting ? 'Existing' as const : 'New' as const,
    status: isExisting ? 'No Count' as const : 'Count' as const,
  };
}

export function getCPPortalLeadMatchInput(input: LeadDuplicateInput): LeadDuplicateInput {
  return {
    phones: input.phones.filter(({ field }) => field === 'phone' || field === 'secondaryPhone'),
    emails: input.emails.filter(({ field }) => field === 'email' || field === 'secondaryEmail'),
  };
}

export function getCPPortalDashboardLeadCount(ownedLeadCount: number, existingSubmissionCount: number) {
  return ownedLeadCount + existingSubmissionCount;
}

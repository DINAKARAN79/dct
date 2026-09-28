import { LeadStatus } from '@prisma/client';

export const VALID_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.INCOMING,
  LeadStatus.PROSPECT,
  LeadStatus.SITE_VISIT_SCHEDULED,
  LeadStatus.SITE_VISIT_HAPPENED,
  LeadStatus.BOOKED,
  LeadStatus.LOST,
];

export const PROFILE_STATUS_ACCESS: Record<string, LeadStatus[]> = {
  Marketing: [LeadStatus.NEW, LeadStatus.INCOMING],
  Presales: [LeadStatus.NEW, LeadStatus.INCOMING],
  SVC: [LeadStatus.PROSPECT, LeadStatus.SITE_VISIT_SCHEDULED],
  Sales: [LeadStatus.SITE_VISIT_SCHEDULED, LeadStatus.SITE_VISIT_HAPPENED],
  CRM: [LeadStatus.SITE_VISIT_HAPPENED, LeadStatus.BOOKED],
  Finance: [LeadStatus.BOOKED],
  Recovery: [LeadStatus.LOST],
  Manager: [...VALID_LEAD_STATUSES],
  Admin: [...VALID_LEAD_STATUSES],
  'CRM Admin': [...VALID_LEAD_STATUSES],
};

export const STATUS_TRANSITIONS: Record<string, { next: LeadStatus; profiles: string[] }[]> = {
  [LeadStatus.NEW]: [
    { next: LeadStatus.INCOMING, profiles: ['Marketing', 'Presales', 'Admin', 'CRM Admin'] },
  ],
  [LeadStatus.INCOMING]: [
    { next: LeadStatus.PROSPECT, profiles: ['Presales', 'Admin', 'CRM Admin'] },
    { next: LeadStatus.LOST, profiles: ['Presales', 'Recovery', 'Admin', 'CRM Admin'] },
  ],
  [LeadStatus.PROSPECT]: [
    { next: LeadStatus.SITE_VISIT_SCHEDULED, profiles: ['SVC', 'Admin', 'CRM Admin'] },
  ],
  [LeadStatus.SITE_VISIT_SCHEDULED]: [
    { next: LeadStatus.SITE_VISIT_HAPPENED, profiles: ['SVC', 'Sales', 'Admin', 'CRM Admin'] },
  ],
  [LeadStatus.SITE_VISIT_HAPPENED]: [
    { next: LeadStatus.BOOKED, profiles: ['CRM', 'Sales', 'Admin', 'CRM Admin'] },
  ],
  [LeadStatus.BOOKED]: [],
  [LeadStatus.LOST]: [
    { next: LeadStatus.INCOMING, profiles: ['Recovery', 'Admin', 'CRM Admin'] },
  ],
};

export function canAccessStatus(profileName: string, status: string): boolean {
  const allowedStatuses = PROFILE_STATUS_ACCESS[profileName];
  if (!allowedStatuses) return false;
  return allowedStatuses.includes(status as LeadStatus);
}

export function canTransitionStatus(
  profileName: string,
  currentStatus: string,
  targetStatus: string
): boolean {
  const transitions = STATUS_TRANSITIONS[currentStatus];
  if (!transitions) return false;
  const transition = transitions.find((t) => t.next === targetStatus);
  if (!transition) return false;
  return transition.profiles.includes(profileName);
}

export function getAllowedStatuses(profileName: string): string[] {
  const allowedStatuses = PROFILE_STATUS_ACCESS[profileName];
  if (!allowedStatuses) return [];
  return allowedStatuses.map((status) => status as string);
}

export function getAvailableTransitions(profileName: string, currentStatus: string): string[] {
  const transitions = STATUS_TRANSITIONS[currentStatus];
  if (!transitions) return [];
  return transitions
    .filter((t) => t.profiles.includes(profileName))
    .map((t) => t.next as string);
}

export function isValidStatus(status: string): boolean {
  return VALID_LEAD_STATUSES.includes(status as LeadStatus);
}

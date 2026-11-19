import type { Prisma } from '@prisma/client';
import { getCPPortalLeadClassification } from './cpPortalLeadClassification';

export interface CPPortalEnquirySubmission {
  id: string;
  enquiryNumber: string;
  leadType: string;
  phone: string | null;
  secondaryPhone: string | null;
  tertiaryPhone: string | null;
  email: string | null;
  secondaryEmail: string | null;
  projectId: string | null;
  project: { id: string; name: string } | null;
  budgetDetails: Prisma.JsonValue | null;
  createdAt: Date;
  description: string | null;
}

function detailsObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringDetail(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function numberDetail(value: Prisma.JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toCPPortalSubmissionLead(enquiry: CPPortalEnquirySubmission) {
  const details = detailsObject(enquiry.budgetDetails);
  const fullName = stringDetail(details.fullName)?.trim() || 'Submission details unavailable';
  const nameParts = fullName.split(/\s+/);
  const lastName = nameParts.pop() || 'Submission';
  const description = enquiry.description || '';
  const classification = getCPPortalLeadClassification(enquiry.leadType);

  return {
    id: `cp-submission:${enquiry.id}`,
    leadNumber: enquiry.enquiryNumber,
    firstName: nameParts.length ? nameParts.join(' ') : null,
    lastName,
    email: enquiry.email,
    secondaryEmail: enquiry.secondaryEmail,
    phone: enquiry.phone,
    secondaryPhone: enquiry.secondaryPhone,
    tertiaryPhone: enquiry.tertiaryPhone,
    projectId: enquiry.projectId,
    budget: numberDetail(details.budget),
    sqftRange: stringDetail(details.sqftRange),
    bhkSize: stringDetail(details.bhkSize),
    propertyType: stringDetail(details.propertyType),
    source: 'CHANNEL_PARTNER',
    status: 'NEW',
    rating: stringDetail(details.stage),
    validity: null,
    cpPortalType: classification.type,
    cpPortalStatus: classification.status,
    createdAt: enquiry.createdAt.toISOString(),
    description: enquiry.description,
    invoiceRaised: false,
    isRegistered: false,
    cancelledAfterBooking: false,
    project: enquiry.project,
    siteVisits: [],
    bookings: [],
    activities: [],
    cpPortalNotes: description
      ? [{
          id: enquiry.id,
          category: 'Initial Remarks',
          text: description,
          createdAt: enquiry.createdAt.toISOString(),
        }]
      : [],
    cpPortalSubmission: true as const,
  };
}

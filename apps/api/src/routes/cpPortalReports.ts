import type { Prisma } from '@prisma/client';

const reportFilters: Record<string, Prisma.LeadWhereInput | null> = {
  'total-leads': {},
  'lost-leads': { status: 'LOST' },
  'site-visits': { siteVisits: { some: { status: 'COMPLETED' } } },
  'qualified-leads': { rating: { in: ['HOT', 'WARM'] } },
  'booked-leads': { status: 'BOOKED' },
  'commission-paid': null,
  'registered-leads': { isRegistered: true },
  'commission-pending': null,
  'cancelled-after-booking': { bookings: { some: { status: 'CANCELLED' } } },
  'invoices-raised': null,
};

const existingSubmissionReportFilters: Record<string, Prisma.EnquiryWhereInput> = {
  'lost-leads': { details: { path: ['stage'], equals: 'lost' } },
  'qualified-leads': {
    OR: [
      { details: { path: ['stage'], equals: 'hot' } },
      { details: { path: ['stage'], equals: 'warm' } },
    ],
  },
};

export function getCPPortalReportFilter(report: string): Prisma.LeadWhereInput | null | undefined {
  return Object.prototype.hasOwnProperty.call(reportFilters, report) ? reportFilters[report] : undefined;
}

export function getCPPortalExistingSubmissionReportFilter(
  report: 'lost-leads' | 'qualified-leads',
): Prisma.EnquiryWhereInput;
export function getCPPortalExistingSubmissionReportFilter(report: string): Prisma.EnquiryWhereInput | null;
export function getCPPortalExistingSubmissionReportFilter(report: string): Prisma.EnquiryWhereInput | null {
  if (!report || report === 'total-leads') return {};
  return existingSubmissionReportFilters[report] ?? null;
}

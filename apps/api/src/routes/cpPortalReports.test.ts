import { describe, expect, it } from 'vitest';
import {
  getCPPortalExistingSubmissionReportFilter,
  getCPPortalReportFilter,
} from './cpPortalReports';

describe('CP portal lead reports', () => {
  it('maps tracked reports to their CRM lead criteria', () => {
    expect(getCPPortalReportFilter('lost-leads')).toEqual({ status: 'LOST' });
    expect(getCPPortalReportFilter('site-visits')).toEqual({
      siteVisits: { some: { status: 'COMPLETED' } },
    });
    expect(getCPPortalReportFilter('qualified-leads')).toEqual({
      rating: { in: ['HOT', 'WARM'] },
    });
    expect(getCPPortalReportFilter('booked-leads')).toEqual({ status: 'BOOKED' });
    expect(getCPPortalReportFilter('registered-leads')).toEqual({ isRegistered: true });
    expect(getCPPortalReportFilter('cancelled-after-booking')).toEqual({
      bookings: { some: { status: 'CANCELLED' } },
    });
  });

  it('marks reports without CRM tracking as unavailable and rejects unknown report names', () => {
    expect(getCPPortalReportFilter('commission-paid')).toBeNull();
    expect(getCPPortalReportFilter('commission-pending')).toBeNull();
    expect(getCPPortalReportFilter('invoices-raised')).toBeNull();
    expect(getCPPortalReportFilter('unknown-report')).toBeUndefined();
  });

  it('uses the same report criteria for existing CP submissions', () => {
    expect(getCPPortalExistingSubmissionReportFilter('total-leads')).toEqual({});
    expect(getCPPortalExistingSubmissionReportFilter('lost-leads')).toEqual({
      details: { path: ['stage'], equals: 'lost' },
    });
    expect(getCPPortalExistingSubmissionReportFilter('qualified-leads')).toEqual({
      OR: [
        { details: { path: ['stage'], equals: 'hot' } },
        { details: { path: ['stage'], equals: 'warm' } },
      ],
    });
    expect(getCPPortalExistingSubmissionReportFilter('site-visits')).toBeNull();
  });
});

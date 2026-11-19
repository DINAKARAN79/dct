import { describe, expect, it } from 'vitest';
import { toCPPortalSubmissionLead } from './cpPortalLeadSubmission';

describe('CP portal existing-lead submission rows', () => {
  it('projects only the submitted enquiry details and classifies it as Existing / No Count', () => {
    const createdAt = new Date('2026-11-16T08:00:00.000Z');
    expect(toCPPortalSubmissionLead({
      id: 'enquiry-1',
      enquiryNumber: 'ENQ000001',
      leadType: 'ADDITIONAL',
      phone: '+919876543210',
      secondaryPhone: '+919876543211',
      tertiaryPhone: null,
      email: 'person@example.com',
      secondaryEmail: 'person+secondary@example.com',
      projectId: 'project-1',
      project: { id: 'project-1', name: 'Submitted Project' },
      budgetDetails: {
        fullName: 'Priya Rao',
        budget: 12000000,
        sqftRange: '1500-1800',
        bhkSize: '3 BHK',
        propertyType: 'Apartment',
        stage: 'warm',
      },
      createdAt,
      description: 'Please call in the evening.',
    })).toEqual({
      id: 'cp-submission:enquiry-1',
      leadNumber: 'ENQ000001',
      firstName: 'Priya',
      lastName: 'Rao',
      email: 'person@example.com',
      secondaryEmail: 'person+secondary@example.com',
      phone: '+919876543210',
      secondaryPhone: '+919876543211',
      tertiaryPhone: null,
      projectId: 'project-1',
      budget: 12000000,
      sqftRange: '1500-1800',
      bhkSize: '3 BHK',
      propertyType: 'Apartment',
      source: 'CHANNEL_PARTNER',
      status: 'NEW',
      rating: 'warm',
      validity: null,
      cpPortalType: 'Existing',
      cpPortalStatus: 'No Count',
      createdAt: '2026-11-16T08:00:00.000Z',
      description: 'Please call in the evening.',
      invoiceRaised: false,
      isRegistered: false,
      cancelledAfterBooking: false,
      project: { id: 'project-1', name: 'Submitted Project' },
      siteVisits: [],
      bookings: [],
      activities: [],
      cpPortalNotes: [{
        id: 'enquiry-1',
        category: 'Initial Remarks',
        text: 'Please call in the evening.',
        createdAt: '2026-11-16T08:00:00.000Z',
      }],
      cpPortalSubmission: true,
    });
  });
});

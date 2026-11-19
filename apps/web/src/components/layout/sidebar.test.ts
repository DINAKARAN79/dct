import { describe, expect, it } from 'vitest';
import { RECEIPT_APPROVAL_REVIEWER_USER_IDS } from '@dct-crm/shared';
import { getNavigationByProfile } from './sidebar';

describe('getNavigationByProfile', () => {
  it('does not grant all CRM modules to an admin profile without matching effective permissions', () => {
    const nav = getNavigationByProfile('Sales Executive', [], () => false, false, true);

    expect(nav.some((item) => item.href === '/setup')).toBe(true);
    expect(nav.some((item) => item.href === '/mis-approvals')).toBe(true);
    expect(nav.some((item) => item.href === '/leads')).toBe(false);
    expect(nav.some((item) => item.href === '/bookings')).toBe(true);
    expect(nav.some((item) => item.href === '/reports')).toBe(false);
  });

  it('grants module access only when the required effective permission exists', () => {
    const nav = getNavigationByProfile('Sales Executive', [], (perm) => perm === 'LEAD_READ' || perm === 'REPORT_VIEW', false, false);

    expect(nav.some((item) => item.href === '/leads')).toBe(true);
    expect(nav.some((item) => item.href === '/reports')).toBe(true);
    expect(nav.some((item) => item.href === '/opportunities')).toBe(false);
  });

  it('shows MIS approval to MIS Quotation Reviewer profiles and the assigned reviewer', () => {
    const misNav = getNavigationByProfile('MIS', [], () => false, false, false, undefined, [], RECEIPT_APPROVAL_REVIEWER_USER_IDS.mis);
    const misReviewerNav = getNavigationByProfile('MIS Quotation Reviewer', [], () => false, false, false, ['home']);
    const salesNav = getNavigationByProfile('Sales', [], () => false, false, false);
    const otherMisNav = getNavigationByProfile('MIS', [], () => false, false, false);
    expect(misNav.some((item) => item.href === '/mis-approvals')).toBe(true);
    expect(misNav.some((item) => item.href === '/finance-approvals')).toBe(false);
    expect(misReviewerNav.some((item) => item.href === '/mis-approvals')).toBe(true);
    expect(salesNav.some((item) => item.href === '/mis-approvals')).toBe(false);
    expect(otherMisNav.some((item) => item.href === '/mis-approvals')).toBe(false);
  });

  it('filters configured sidebar items while preserving Home', () => {
    const nav = getNavigationByProfile('Presales', [], (perm) => perm === 'LEAD_READ', false, false, ['leads']);

    expect(nav.map((item) => item.href)).toEqual(['/home', '/leads']);
  });

  it('adds database navigation objects only when enabled and readable', () => {
    const nav = getNavigationByProfile(
      'Sales',
      [],
      (permission) => permission === 'WARRANTY_CASE_READ',
      false,
      false,
      ['home', 'object:WarrantyCase'],
      [
        { name: 'WarrantyCase', pluralLabel: 'Warranty Cases', isAvailableInNavigation: true },
        { name: 'HiddenRecord', pluralLabel: 'Hidden Records', isAvailableInNavigation: false },
        { name: 'Activity', pluralLabel: 'Activities', isAvailableInNavigation: true },
        { name: 'Enquiry', pluralLabel: 'Enquiries', isAvailableInNavigation: true },
        { name: 'Task', pluralLabel: 'Tasks', isAvailableInNavigation: true },
      ],
    );

    expect(nav.some((item) => item.title === 'Warranty Cases' && item.href === '/objects/WarrantyCase')).toBe(true);
    expect(nav.some((item) => item.title === 'Hidden Records')).toBe(false);
    expect(nav.some((item) => ['Activities', 'Enquiries', 'Tasks'].includes(item.title))).toBe(false);
  });

  it('filters administrator navigation and ignores settings for superadmins', () => {
    const adminNav = getNavigationByProfile('Admin', [], () => false, false, true, ['home']);
    const superAdminNav = getNavigationByProfile(undefined, [], () => false, true, true, ['home']);

    expect(adminNav.some((item) => item.href === '/setup')).toBe(false);
    expect(superAdminNav.some((item) => item.href === '/admin/companies')).toBe(true);
  });

});

describe('role-based sidebar matrix', () => {
  const withPerms = (...perms: string[]) => (perm: string) => perms.includes(perm);

  const presalesPerms = ['LEAD_READ', 'SITE_VISIT_READ', 'DASHBOARD_READ', 'REPORT_VIEW'];
  const salesPerms = [
    'LEAD_READ', 'SITE_VISIT_READ', 'DASHBOARD_READ',
    'PROJECT_READ', 'REPORT_VIEW',
  ];
  const crmPerms = [
    'LEAD_READ', 'SITE_VISIT_READ', 'DASHBOARD_READ',
    'PROJECT_READ', 'TASK_READ', 'REPORT_VIEW',
  ];
  const allPerms = [
    'LEAD_READ', 'SITE_VISIT_READ', 'PROJECT_READ', 'TASK_READ', 'UNIT_READ',
    'FOLLOW_UP_READ', 'REPORT_VIEW',
  ];

  it('Presales sees Home, Leads, Site Visits, and Reports', () => {
    const nav = getNavigationByProfile('Presales', [], withPerms(...presalesPerms), false, false);
    expect(nav.map((item) => item.title)).toEqual(['Home', 'Leads', 'Site Visits', 'Reports']);
  });

  it('SVC sees Units when Unit read access is granted', () => {
    const nav = getNavigationByProfile('SVC', [], withPerms(...presalesPerms, 'UNIT_READ'), false, false);
    expect(nav.map((item) => item.title)).toEqual(['Home', 'Leads', 'Site Visits', 'Units', 'Reports']);
  });

  it('Sales sees Leads, Site Visits, and Reports without removed commercial modules', () => {
    const nav = getNavigationByProfile('Sales', [], withPerms(...salesPerms), false, false);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Leads', 'Site Visits', 'Reports',
    ]);
  });

  it('CRM hides the lead module while keeping the booking-related workflow modules visible', () => {
    const nav = getNavigationByProfile('CRM', [], withPerms(...crmPerms), false, false);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Booking Details', 'Site Visits', 'Projects', 'Reports',
    ]);
    expect(nav.some((item) => item.href === '/leads')).toBe(false);
  });

  it('Admin does not show Pre Sales, Sales, or SVC in the sidebar', () => {
    const nav = getNavigationByProfile('Admin', [], withPerms(...allPerms), false, true);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Leads', 'Booking Details', 'Site Visits', 'MIS Approval', 'Finance Approval', 'Projects', 'Units', 'Reports', 'Follow-ups', 'Setup',
    ]);
    expect(nav.some((item) => item.href === '/profiles/pre-sales')).toBe(false);
    expect(nav.some((item) => item.href === '/profiles/sales')).toBe(false);
    expect(nav.some((item) => item.href === '/profiles/svc')).toBe(false);
  });

  it('shows Finance Approval to all Finance profiles, even when sidebar access is configured', () => {
    const financeTeamNav = getNavigationByProfile('Finance Team', [], withPerms(...allPerms), false, false, ['home']);
    const financeNav = getNavigationByProfile('Finance', [], withPerms(...allPerms), false, false);
    const salesNav = getNavigationByProfile('Sales', [], withPerms(...allPerms), false, false);
    expect(financeTeamNav.some((item) => item.title === 'Finance Approval' && item.href === '/finance-approvals')).toBe(true);
    expect(financeNav.some((item) => item.href === '/finance-approvals')).toBe(true);
    expect(financeTeamNav.some((item) => item.href === '/mis-approvals')).toBe(false);
    expect(salesNav.some((item) => item.href === '/finance-approvals')).toBe(false);
  });

  it('shows Units to non-admin profiles when Unit read access is granted', () => {
    const nav = getNavigationByProfile('Sales', [], withPerms(...allPerms), false, false);
    expect(nav.some((item) => item.title === 'Home')).toBe(true);
    expect(nav.some((item) => item.href === '/units')).toBe(true);
    expect(nav.some((item) => item.title === 'Reports')).toBe(true);
    expect(nav.some((item) => item.title === 'Leads')).toBe(true);
    expect(nav.some((item) => item.title === 'Tasks' || item.href === '/tasks')).toBe(false);
    expect(nav.some((item) => item.title === 'Follow-ups')).toBe(true);
    expect(nav.some((item) => item.title === 'Setup')).toBe(false);
  });

  it('Superadmin sees the superadmin navigation', () => {
    const nav = getNavigationByProfile(undefined, [], () => false, true, true);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Companies', 'Companies API', 'Custom Project Layouts',
      'Platform Dashboard', 'Dashboard Management', 'Report Management', 'Report Builder', 'Object Explorer', 'Tenant Analytics',
      'MIS Approval', 'Finance Approval',
    ]);
  });
});
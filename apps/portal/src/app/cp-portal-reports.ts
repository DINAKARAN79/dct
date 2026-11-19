export const cpDashboardReports = [
  { id: 'total-leads', label: 'Total Leads Received', statKey: 'totalLeads', icon: '◉', color: 'blue', tracked: true },
  { id: 'lost-leads', label: 'Total Lost Leads', statKey: 'lostLeads', icon: '↘', color: 'red', tracked: true },
  { id: 'site-visits', label: 'Total Site Visits', statKey: 'siteVisits', icon: '⌖', color: 'violet', tracked: true },
  { id: 'qualified-leads', label: 'Total Qualified Leads', statKey: 'qualifiedLeads', icon: '✧', color: 'teal', tracked: true },
  { id: 'booked-leads', label: 'Total Booked Leads', statKey: 'bookedLeads', icon: '✓', color: 'green', tracked: true },
  { id: 'commission-paid', label: 'Commission Paid', statKey: 'commissionPaid', icon: '₹', color: 'amber', tracked: false, unavailableMessage: 'Commission payout status is not tracked in the available CRM data.' },
  { id: 'registered-leads', label: 'Total Registered', statKey: 'registeredLeads', icon: '◎', color: 'blue', tracked: true },
  { id: 'commission-pending', label: 'Commission Pending', statKey: 'commissionPending', icon: '◷', color: 'amber', tracked: false, unavailableMessage: 'Commission payout status is not tracked in the available CRM data.' },
  { id: 'cancelled-after-booking', label: 'Cancelled After Booking', statKey: 'cancelledAfterBooking', icon: '×', color: 'red', tracked: true },
  { id: 'invoices-raised', label: 'Invoices Raised', statKey: 'invoicesRaised', icon: '▤', color: 'violet', tracked: false, unavailableMessage: 'Invoice records are not tracked in the available CRM data.' },
] as const;

export type CpDashboardReportId = (typeof cpDashboardReports)[number]['id'];

export function getCpDashboardReport(id: string | null) {
  return cpDashboardReports.find((report) => report.id === id) || null;
}

export function cpDashboardReportHref(
  id: CpDashboardReportId,
  filters: { projectId: string; from: string; to: string },
) {
  const params = new URLSearchParams({ report: id });
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return `/leads?${params.toString()}`;
}

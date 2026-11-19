import { describe, expect, it } from 'vitest';
import { cpDashboardReportHref, getCpDashboardReport } from './cp-portal-reports';

describe('CP dashboard reports', () => {
  it('links reports to All Leads and preserves dashboard filters', () => {
    expect(cpDashboardReportHref('lost-leads', {
      projectId: 'project/one',
      from: '2026-01-01',
      to: '2026-01-31',
    })).toBe('/leads?report=lost-leads&projectId=project%2Fone&from=2026-01-01&to=2026-01-31');
  });

  it('distinguishes untracked report data from an unknown report', () => {
    expect(getCpDashboardReport('commission-paid')?.tracked).toBe(false);
    expect(getCpDashboardReport('not-a-report')).toBeNull();
  });
});

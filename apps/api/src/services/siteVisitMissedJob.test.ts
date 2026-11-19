import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  siteVisitFindMany: vi.fn(),
  siteVisitUpdateMany: vi.fn(),
  auditLogCreate: vi.fn(),
  tenantFindMany: vi.fn(),
  tenantFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

const tagging = vi.hoisted(() => ({
  tagLeadSiteVisitEvents: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    siteVisit: { findMany: database.siteVisitFindMany },
    tenant: { findMany: database.tenantFindMany, findUnique: database.tenantFindUnique },
    $transaction: database.transaction,
  },
}));

vi.mock('./leadEventTagging', () => tagging);

import {
  crmDayRange,
  executeSiteVisitMissedJob,
  markMissedSiteVisits,
  missedJobDecision,
  normalizeOverdueSiteVisits,
} from './siteVisitMissedJob';

const midnight = new Date('2026-10-16T18:30:00.000Z');
const beforeMidnight = new Date('2026-10-16T18:29:00.000Z');

describe('site visit missed job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        siteVisit: { updateMany: database.siteVisitUpdateMany },
        auditLog: { create: database.auditLogCreate },
      }),
    );
    database.siteVisitFindMany.mockResolvedValue([]);
    database.siteVisitUpdateMany.mockResolvedValue({ count: 1 });
    database.tenantFindMany.mockResolvedValue([{ id: 'tenant-1' }]);
    database.tenantFindUnique.mockResolvedValue({ timezone: 'Asia/Kolkata' });
  });

  it('does not mark visits scheduled for the current day before midnight', async () => {
    const updated = await normalizeOverdueSiteVisits('tenant-1', beforeMidnight);

    expect(updated).toBe(0);
    expect(database.siteVisitFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        scheduledAt: { lt: crmDayRange(beforeMidnight).start },
      }),
    }));
    expect(database.siteVisitUpdateMany).not.toHaveBeenCalled();
  });

  it('uses the tenant-local day and cutoff for site visits', () => {
    const instant = new Date('2026-07-02T07:00:00.000Z');
    const range = crmDayRange(instant, 'America/Los_Angeles');
    expect(range).toEqual({
      dateKey: '2026-07-02',
      start: new Date('2026-07-02T07:00:00.000Z'),
      end: new Date('2026-07-03T07:00:00.000Z'),
    });
    expect(missedJobDecision(instant, null, 'America/Los_Angeles')).toEqual({ run: true, dateKey: '2026-07-02' });
    expect(missedJobDecision(new Date('2026-10-16T19:30:00.000Z'), null, 'Asia/Kolkata').run).toBe(true);
  });

  it('marks incomplete visits from the previous day as missed at midnight', async () => {
    const previousDayVisit = new Date('2026-10-16T04:30:00.000Z');
    database.siteVisitFindMany.mockResolvedValue([
      { id: 'visit-previous-day', leadId: 'lead-1', scheduledAt: previousDayVisit },
    ]);

    const updated = await normalizeOverdueSiteVisits('tenant-1', midnight);

    const { start, end } = crmDayRange(new Date(midnight.getTime() - 1));
    const currentDayStart = crmDayRange(midnight).start;
    expect(updated).toBe(1);
    expect(database.siteVisitFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1',
        status: 'SCHEDULED',
        scheduledAt: { lt: currentDayStart },
      },
    }));
    expect(start.toISOString()).toBe('2026-10-15T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-10-16T18:30:00.000Z');
    expect(database.siteVisitUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'visit-previous-day', tenantId: 'tenant-1', status: 'SCHEDULED' },
      data: { status: 'MISSED', missedAt: expect.any(Date) },
    }));
    expect(database.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'SITE_VISIT_MISSED',
        objectType: 'SiteVisit',
        objectId: 'visit-previous-day',
        newValues: expect.objectContaining({ status: 'MISSED' }),
      }),
    }));
  });

  it('catches up overdue visits when the job runs after midnight', async () => {
    const nextMorning = new Date('2026-10-17T05:00:00.000Z');
    database.siteVisitFindMany.mockResolvedValue([
      { id: 'visit-yesterday', leadId: 'lead-1', scheduledAt: new Date('2026-10-16T04:30:00.000Z') },
    ]);

    const updated = await normalizeOverdueSiteVisits('tenant-1', nextMorning);

    expect(updated).toBe(1);
    expect(database.siteVisitFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        scheduledAt: { lt: crmDayRange(nextMorning).start },
      }),
    }));
    expect(database.siteVisitUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'visit-yesterday', tenantId: 'tenant-1', status: 'SCHEDULED' },
      data: { status: 'MISSED', missedAt: expect.any(Date) },
    }));
  });

  it('does not change a visit that was completed before the update', async () => {
    database.siteVisitFindMany.mockResolvedValue([
      { id: 'visit-completed', leadId: 'lead-1', scheduledAt: new Date('2026-10-16T04:30:00.000Z') },
    ]);
    database.siteVisitUpdateMany.mockResolvedValue({ count: 0 });

    const updated = await normalizeOverdueSiteVisits('tenant-1', midnight);

    expect(updated).toBe(0);
    expect(database.siteVisitUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'SCHEDULED' }),
    }));
    expect(database.auditLogCreate).not.toHaveBeenCalled();
    expect(tagging.tagLeadSiteVisitEvents).not.toHaveBeenCalled();
  });

  it('selects overdue visits from any earlier date but not from the current date', async () => {
    await normalizeOverdueSiteVisits('tenant-1', midnight);

    const currentDayStart = crmDayRange(midnight).start;
    const twoDaysAgo = new Date('2026-10-15T04:30:00.000Z');
    const currentDay = new Date('2026-10-17T04:30:00.000Z');
    expect(twoDaysAgo.getTime()).toBeLessThan(currentDayStart.getTime());
    expect(currentDay.getTime()).toBeGreaterThanOrEqual(currentDayStart.getTime());
    expect(database.siteVisitFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        scheduledAt: { lt: currentDayStart },
      }),
    }));
  });

  it('does not record another missed update when the trigger runs again', async () => {
    const mark = vi.fn().mockResolvedValue(undefined);
    const first = await executeSiteVisitMissedJob({ now: midnight, mark });
    const second = await executeSiteVisitMissedJob({
      now: new Date('2026-10-16T19:00:00.000Z'),
      lastCompletedDate: first.lastCompletedDate,
      mark,
    });

    expect(first.ran).toBe(true);
    expect(second.ran).toBe(false);
    expect(mark).toHaveBeenCalledTimes(1);
    expect(missedJobDecision(midnight, first.dateKey).run).toBe(false);
  });

  it('retries after an error instead of treating the day as finished', async () => {
    const mark = vi.fn().mockRejectedValue(new Error('database unavailable'));

    await expect(executeSiteVisitMissedJob({ now: midnight, mark })).rejects.toThrow('database unavailable');
    expect(missedJobDecision(midnight, null).run).toBe(true);
  });

  it('runs once for a tenant at its local midnight', async () => {
    const tenantId = 'tenant-midnight-once';
    database.tenantFindMany.mockResolvedValue([{ id: tenantId }]);

    await markMissedSiteVisits(midnight);
    await markMissedSiteVisits(midnight);

    expect(database.siteVisitFindMany).toHaveBeenCalledTimes(1);
  });

  it('catches up overdue visits if the API starts after midnight', async () => {
    const tenantId = 'tenant-starts-late';
    const nextMorning = new Date('2026-10-17T05:00:00.000Z');
    database.tenantFindMany.mockResolvedValue([{ id: tenantId, timezone: 'Asia/Kolkata' }]);

    await markMissedSiteVisits(nextMorning);

    expect(database.siteVisitFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        scheduledAt: { lt: crmDayRange(nextMorning, 'Asia/Kolkata').start },
      }),
    }));
  });
});

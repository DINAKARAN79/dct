import type { Prisma } from '@prisma/client';
import { prisma } from '@dct-crm/db';
import { DEFAULT_CRM_TIMEZONE, getCRMDayBounds, resolveCRMTimezone } from '@dct-crm/shared';
import { tagLeadSiteVisitEvents } from './leadEventTagging';
import { getTenantTimezone } from './tenantTimezone';

export const CRM_TIMEZONE = DEFAULT_CRM_TIMEZONE;
export const AUTO_MISSED_REASON =
  'Automatically marked missed after midnight because the site visit scheduled for a previous day was not completed.';

type CrmClock = { year: number; month: number; day: number };

export function crmClock(now: Date, timeZone = CRM_TIMEZONE): CrmClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
  };
}

export function crmDateKey(now: Date, timeZone = CRM_TIMEZONE): string {
  const clock = crmClock(now, timeZone);
  return `${clock.year}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')}`;
}

export function crmDayRange(now: Date, timeZone = CRM_TIMEZONE): { start: Date; end: Date; dateKey: string } {
  const dateKey = crmDateKey(now, timeZone);
  const { start, end } = getCRMDayBounds(now, timeZone);
  return { start, end, dateKey };
}

export function missedJobDecision(now: Date, lastCompletedDate: string | null, timeZone = CRM_TIMEZONE): { run: boolean; dateKey: string } {
  const { dateKey } = crmDayRange(now, timeZone);
  return { run: lastCompletedDate !== dateKey, dateKey };
}

export async function normalizeOverdueSiteVisits(
  tenantId: string,
  now = new Date(),
  configuredTimeZone?: string,
): Promise<number> {
  const timeZone = configuredTimeZone || await getTenantTimezone(tenantId);
  const currentDay = crmDayRange(now, timeZone);
  const overdueVisits = await prisma.siteVisit.findMany({
    where: {
      tenantId,
      status: 'SCHEDULED',
      scheduledAt: { lt: currentDay.start },
    },
    select: { id: true, leadId: true, scheduledAt: true },
  });
  if (overdueVisits.length === 0) return 0;

  let updatedCount = 0;
  await prisma.$transaction(async (tx) => {
    for (const visit of overdueVisits) {
      const missedAt = new Date();
      const updated = await tx.siteVisit.updateMany({
        where: { id: visit.id, tenantId, status: 'SCHEDULED' },
        data: { status: 'MISSED', missedAt },
      });
      if (updated.count === 0) continue;
      updatedCount += updated.count;
      await tagLeadSiteVisitEvents(tx, { tenantId, leadId: visit.leadId });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: null,
          leadId: visit.leadId,
          action: 'SITE_VISIT_MISSED',
          objectType: 'SiteVisit',
          objectId: visit.id,
          oldValues: { status: 'SCHEDULED', scheduledAt: visit.scheduledAt.toISOString() } as Prisma.InputJsonValue,
          newValues: {
            status: 'MISSED',
            missedAt: missedAt.toISOString(),
            reason: AUTO_MISSED_REASON,
            source: 'SYSTEM',
          },
        },
      });
    }
  });
  return updatedCount;
}

const lastCompletedDateByTenant = new Map<string, string>();

export async function markMissedSiteVisits(now = new Date()): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, timezone: true } });
  const failures: string[] = [];
  for (const tenant of tenants) {
    try {
      const timeZone = resolveCRMTimezone(tenant.timezone);
      const previousDate = lastCompletedDateByTenant.get(tenant.id) ?? null;
      const decision = missedJobDecision(now, previousDate, timeZone);
      if (!decision.run) continue;
      await normalizeOverdueSiteVisits(tenant.id, now, timeZone);
      lastCompletedDateByTenant.set(tenant.id, decision.dateKey);
    } catch (error) {
      failures.push(tenant.id);
      console.error(`Site visit missed job failed for tenant ${tenant.id}:`, error);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Site visit missed job failed for ${failures.length} company`);
  }
}

export async function executeSiteVisitMissedJob(options: {
  now?: Date;
  lastCompletedDate?: string | null;
  mark?: (now: Date) => Promise<void>;
} = {}): Promise<{ ran: boolean; dateKey: string; lastCompletedDate: string | null }> {
  const now = options.now ?? new Date();
  const previous = options.lastCompletedDate ?? null;
  const decision = missedJobDecision(now, previous);
  if (!decision.run) return { ran: false, dateKey: decision.dateKey, lastCompletedDate: previous };
  await (options.mark ?? markMissedSiteVisits)(now);
  return { ran: true, dateKey: decision.dateKey, lastCompletedDate: decision.dateKey };
}

let inFlight: Promise<void> | null = null;

export async function runSiteVisitMissedSchedulerTick(now = new Date()): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = markMissedSiteVisits(now);
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}

export function startSiteVisitMissedScheduler(): () => void {
  const tick = () => {
    void runSiteVisitMissedSchedulerTick().catch((error) => {
      console.error('Site visit missed job error:', error);
    });
  };
  tick();
  const timer = setInterval(tick, 30_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

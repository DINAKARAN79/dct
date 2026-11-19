import { prisma } from '@dct-crm/db';
import { EffectivePermissionService } from './effectivePermissions';
import { getRoleHierarchyUserIds } from './metadata';

export type ReportShowMe = 'all' | 'mine' | 'team';

export type AuthUserLike = {
  id: string;
  tenantId: string;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  profileName?: string | null;
};

export type RecordScope =
  | { type: 'ALL' }
  | { type: 'OWNER'; userId: string }
  | { type: 'TEAM'; userIds: string[] };

function scopeFromHierarchy(userId: string, userIds: string[]): RecordScope {
  const scopedUserIds = [...new Set([userId, ...userIds])];
  return scopedUserIds.length > 1
    ? { type: 'TEAM', userIds: scopedUserIds }
    : { type: 'OWNER', userId };
}

function scopeUserIds(scope: RecordScope): string[] | null {
  if (scope.type === 'ALL') return null;
  return scope.type === 'OWNER' ? [scope.userId] : scope.userIds;
}

function userInScope(scope: RecordScope, userId: string | null): boolean {
  if (scope.type === 'ALL') return true;
  return Boolean(userId && scopeUserIds(scope)?.includes(userId));
}

function ownerScopeClause(scope: RecordScope): Record<string, unknown> | null {
  if (scope.type === 'ALL') return null;
  return { ownerId: { in: scopeUserIds(scope)! } };
}

async function hasLegacyViewAll(userId: string, objectName: string): Promise<boolean> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissionSets: {
            include: { permissionSet: true },
          },
        },
      },
    },
  });

  for (const userRole of userRoles) {
    for (const rolePerm of userRole.role.permissionSets) {
      if (rolePerm.permissionSet.objectName === objectName) {
        const permissions = rolePerm.permissionSet.permissions as {
          viewAll?: boolean;
          modifyAll?: boolean;
        };
        if (permissions?.viewAll || permissions?.modifyAll) return true;
      }
    }
  }
  return false;
}

export async function getRecordScope(
  user: AuthUserLike,
  objectName: string,
  moduleName: string,
): Promise<RecordScope> {
  if (user.isSuperAdmin || user.isAdmin) return { type: 'ALL' };

  const permsPromise = EffectivePermissionService.getEffectivePermissionsCached(user, user.id);
  const [perms, legacy] = await Promise.all([
    permsPromise,
    hasLegacyViewAll(user.id, objectName),
  ]);

  const viewAll = EffectivePermissionService.hasPermissionIn(perms, `${moduleName}_VIEW_ALL`);
  const modifyAll = EffectivePermissionService.hasPermissionIn(perms, `${moduleName}_MODIFY_ALL`);

  if (viewAll || modifyAll || legacy) return { type: 'ALL' };
  return scopeFromHierarchy(user.id, await getRoleHierarchyUserIds(user.tenantId, user.id));
}

export async function getLeadRecordScope(user: AuthUserLike): Promise<RecordScope> {
  if (user.isSuperAdmin || user.isAdmin || await EffectivePermissionService.canViewAll(user.id, 'lead')) {
    return { type: 'ALL' };
  }
  return getRecordScope(user, 'Lead', 'LEAD');
}

export async function getHierarchyRecordScope(user: AuthUserLike): Promise<RecordScope> {
  return scopeFromHierarchy(user.id, await getRoleHierarchyUserIds(user.tenantId, user.id));
}

export function leadScopeClause(scope: RecordScope): Record<string, unknown> | null {
  return ownerScopeClause(scope);
}

export async function canAccessLead(
  user: AuthUserLike,
  lead: { id: string; tenantId: string; ownerId: string | null; creatorId?: string | null },
): Promise<boolean> {
  if (!user.isSuperAdmin && lead.tenantId !== user.tenantId) return false;
  const scope = await getLeadRecordScope(user);
  return userInScope(scope, lead.ownerId);
}

export async function canEditLead(
  user: AuthUserLike,
  lead: { id: string; tenantId: string; ownerId: string | null; creatorId?: string | null },
): Promise<boolean> {
  if (!(await canAccessLead(user, lead))) return false;
  if (user.isSuperAdmin || user.isAdmin) return true;
  if (await EffectivePermissionService.canEditAll(user.id, 'lead')) return true;
  const permissions = await EffectivePermissionService.getEffectivePermissionsCached(user, user.id);
  if (EffectivePermissionService.hasPermissionIn(permissions, 'LEAD_MODIFY_ALL')) return true;
  return lead.ownerId === user.id;
}

export async function canAccessLeadId(user: AuthUserLike, leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...(user.isSuperAdmin ? {} : { tenantId: user.tenantId }) },
    select: { id: true, tenantId: true, ownerId: true, creatorId: true },
  });
  if (!lead) return false;
  return canAccessLead(user, lead);
}

export function ownerOwnedClause(userId: string): Record<string, unknown> {
  return { ownerId: userId };
}

export async function canAccessSiteVisit(
  user: AuthUserLike,
  sv: { id: string; tenantId: string; assigneeId: string | null; creatorId: string | null; leadId: string },
): Promise<boolean> {
  if (!user.isSuperAdmin && sv.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'SiteVisit', 'SITE_VISIT');
  if (scope.type === 'ALL') return true;
  if (userInScope(scope, sv.assigneeId) || userInScope(scope, sv.creatorId)) return true;
  return canAccessLeadId(user, sv.leadId);
}

export async function canAccessTask(
  user: AuthUserLike,
  task: { id: string; tenantId: string; ownerId: string | null; leadId: string | null },
): Promise<boolean> {
  if (!user.isSuperAdmin && task.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'Task', 'TASK');
  return userInScope(scope, task.ownerId);
}

export async function canAccessFollowUp(
  user: AuthUserLike,
  fu: { id: string; tenantId: string; ownerId: string | null; leadId: string | null },
): Promise<boolean> {
  if (!user.isSuperAdmin && fu.tenantId !== user.tenantId) return false;
  return userInScope(await getRecordScope(user, 'FollowUp', 'FOLLOW_UP'), fu.ownerId);
}

export async function canAccessActivity(
  user: AuthUserLike,
  activity: { id: string; tenantId: string; userId: string | null; leadId: string | null },
): Promise<boolean> {
  if (activity.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'Activity', 'ACTIVITY');
  return userInScope(scope, activity.userId);
}

/** Merge a base where object with an optional scope clause using AND. */
export function withScope(
  where: Record<string, unknown>,
  scopeClause: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!scopeClause) return where;
  return { AND: [where, scopeClause] };
}

export type RecordKind =
  | 'lead'
  | 'siteVisit'
  | 'task'
  | 'followUp'
  | 'activity';

const builders: Record<
  RecordKind,
  (scope: RecordScope) => Record<string, unknown> | null
> = {
  lead: leadScopeClause,
  siteVisit: (scope) => {
    if (scope.type === 'ALL') return null;
    const userIds = scopeUserIds(scope)!;
    return {
      OR: [
        { assigneeId: { in: userIds } },
        { creatorId: { in: userIds } },
        { lead: leadScopeClause(scope) },
      ],
    };
  },
  task: ownerScopeClause,
  followUp: ownerScopeClause,
  activity: (scope) => {
    if (scope.type === 'ALL') return null;
    return { userId: { in: scopeUserIds(scope)! } };
  },
};

export async function getScopeClause(
  user: AuthUserLike,
  kind: RecordKind,
): Promise<Record<string, unknown> | null> {
  const meta: Record<RecordKind, { objectName: string; moduleName: string }> = {
    lead: { objectName: 'Lead', moduleName: 'LEAD' },
    siteVisit: { objectName: 'SiteVisit', moduleName: 'SITE_VISIT' },
    task: { objectName: 'Task', moduleName: 'TASK' },
    followUp: { objectName: 'FollowUp', moduleName: 'FOLLOW_UP' },
    activity: { objectName: 'Activity', moduleName: 'ACTIVITY' },
  };
  return builders[kind](await getRecordScope(user, meta[kind].objectName, meta[kind].moduleName));
}

export async function getReportRecordAccessClause(
  user: AuthUserLike,
  objectName: string,
  showMe: ReportShowMe = 'all',
  teamUserIds?: string[],
  hasOwnerId = false,
): Promise<Record<string, unknown> | null> {
  const normalized = objectName.replace(/[\s_-]/g, '').toLowerCase();
  const kinds: Record<string, RecordKind> = {
    lead: 'lead',
    sitevisit: 'siteVisit',
    task: 'task',
    followup: 'followUp',
    activity: 'activity',
  };
  const assignedRecordClause = (userIds: string[]) => {
    const users = { in: userIds };
    if (normalized === 'sitevisit') {
      return {
        OR: [
          { assigneeId: users },
          { creatorId: users },
          { lead: { ownerId: users } },
        ],
      };
    }
    if (normalized === 'activity') return { userId: users };
    if (normalized === 'calldetail') {
      return {
        OR: [
          { ownerId: users },
          { ownerId: null, createdById: users },
        ],
      };
    }
    if (normalized === 'lead' || normalized === 'task' || normalized === 'followup') {
      return { ownerId: users };
    }
    if (normalized === 'booking') {
      return { OR: [{ ownerId: users }, { lead: { ownerId: users } }] };
    }
    if (normalized === 'receipt' || normalized === 'refundrequest') {
      return {
        OR: [
          { lead: { ownerId: users } },
          { booking: { ownerId: users } },
          { createdById: users },
        ],
      };
    }
    if (normalized === 'bookingrefundrequest') {
      return {
        OR: [
          { booking: { ownerId: users } },
          { booking: { lead: { ownerId: users } } },
        ],
      };
    }
    if (normalized === 'project') return { leads: { some: { ownerId: users } } };
    if (normalized === 'unit') {
      return {
        OR: [
          { ownerId: users },
          { customerLead: { ownerId: users } },
          { bookingLead: { ownerId: users } },
          { opportunityLead: { ownerId: users } },
          { bookings: { some: { OR: [{ ownerId: users }, { lead: { ownerId: users } }] } } },
        ],
      };
    }
    if (normalized === 'quotation') {
      return {
        OR: [
          { lead: { ownerId: users } },
          { siteVisit: { assigneeId: users } },
          { siteVisit: { creatorId: users } },
          { createdById: users },
        ],
      };
    }
    if (normalized === 'rrqueuemember') return { userId: users };
    if (normalized === 'user') return { id: users };
    if (hasOwnerId) return { ownerId: users };
    return null;
  };
  if (showMe === 'team' || showMe === 'mine') {
    const userIds = showMe === 'mine'
      ? [user.id]
      : teamUserIds ?? await getRoleHierarchyUserIds(user.tenantId, user.id);
    return assignedRecordClause(userIds);
  }
  const kind = kinds[normalized];
  if (kind) return getScopeClause(user, kind);
  if (normalized === 'calldetail') {
    const scope = await getRecordScope(user, 'Activity', 'ACTIVITY');
    if (scope.type === 'ALL') return null;
    return assignedRecordClause(scopeUserIds(scope)!);
  }
  if (
    normalized === 'booking'
    || normalized === 'receipt'
    || normalized === 'refundrequest'
    || normalized === 'bookingrefundrequest'
    || normalized === 'project'
    || normalized === 'unit'
    || normalized === 'quotation'
    || normalized === 'rrqueuemember'
    || normalized === 'user'
  ) {
    const moduleNames: Record<string, string> = {
      booking: 'BOOKING',
      receipt: 'RECEIPT',
      refundrequest: 'REFUND_REQUEST',
      bookingrefundrequest: 'BOOKING_REFUND_REQUEST',
      project: 'PROJECT',
      unit: 'UNIT',
      quotation: 'QUOTATION',
      rrqueuemember: 'RR_QUEUE_MEMBER',
      user: 'USER',
    };
    const moduleName = moduleNames[normalized];
    const scope = await getRecordScope(user, objectName, moduleName);
    return scope.type === 'ALL' ? null : assignedRecordClause(scopeUserIds(scope)!);
  }
  if (hasOwnerId) {
    return ownerScopeClause(await getRecordScope(user, objectName, normalized.toUpperCase()));
  }
  return null;
}

/** Apply scope into a where clause with AND (preserves existing AND arrays). */
export function applyScope(
  where: Record<string, unknown>,
  scopeClause: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!scopeClause) return where;
  const existing = where.AND;
  if (Array.isArray(existing)) {
    return { ...where, AND: [...existing, scopeClause] };
  }
  return { ...where, AND: [scopeClause] };
}

/** Force report showMe for OWNER-scoped users. Frontend cannot override. */
export async function resolveReportShowMe(
  user: AuthUserLike,
  requested: unknown,
): Promise<ReportShowMe> {
  const scope = await getLeadRecordScope(user);
  if (scope.type === 'OWNER') return requested === 'team' ? 'team' : 'mine';
  if (requested === 'mine' || requested === 'team') return requested;
  return 'all';
}
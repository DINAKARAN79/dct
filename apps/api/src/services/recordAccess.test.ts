import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  auditLogFindFirst: vi.fn(),
  rrQueueHistoryFindFirst: vi.fn(),
  siteVisitFindFirst: vi.fn(),
  userRoleFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  userFindMany: vi.fn(),
  roleFindMany: vi.fn(),
  canViewAll: vi.fn(),
  canEditAll: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    auditLog: { findFirst: db.auditLogFindFirst },
    rRQueueHistory: { findFirst: db.rrQueueHistoryFindFirst },
    siteVisit: { findFirst: db.siteVisitFindFirst },
    userRole: { findMany: db.userRoleFindMany },
    user: { findFirst: db.userFindFirst, findMany: db.userFindMany },
    role: { findMany: db.roleFindMany },
  },
}));

vi.mock('./effectivePermissions', () => ({
  EffectivePermissionService: {
    getEffectivePermissionsCached: vi.fn().mockResolvedValue([]),
    hasPermissionIn: vi.fn().mockReturnValue(false),
    canViewAll: db.canViewAll,
    canEditAll: db.canEditAll,
  },
}));

import {
  canAccessLead,
  canEditLead,
  getHierarchyRecordScope,
  getLeadRecordScope,
  getReportRecordAccessClause,
  getScopeClause,
  leadScopeClause,
  resolveReportShowMe,
} from './recordAccess';

describe('owner-scoped record access', () => {
  const user = { id: 'user-a', tenantId: 'tenant-a' };
  const lead = { id: 'lead-a', tenantId: 'tenant-a', ownerId: 'other-user' };

  beforeEach(() => {
    vi.clearAllMocks();
    db.auditLogFindFirst.mockResolvedValue(null);
    db.rrQueueHistoryFindFirst.mockResolvedValue(null);
    db.siteVisitFindFirst.mockResolvedValue(null);
    db.userRoleFindMany.mockResolvedValue([]);
    db.userFindFirst.mockResolvedValue(null);
    db.userFindMany.mockResolvedValue([]);
    db.roleFindMany.mockResolvedValue([]);
    db.canViewAll.mockResolvedValue(false);
    db.canEditAll.mockResolvedValue(false);
  });

  it('limits owner-scoped lead queries to leads owned by the current user', () => {
    expect(leadScopeClause({ type: 'OWNER', userId: user.id })).toEqual({ ownerId: { in: [user.id] } });
  });

  it('allows the lead owner to read and edit, but does not grant handoff users access', async () => {
    await expect(canAccessLead(user, { ...lead, ownerId: user.id })).resolves.toBe(true);
    await expect(canEditLead(user, { ...lead, ownerId: user.id })).resolves.toBe(true);

    db.auditLogFindFirst.mockResolvedValue({ id: 'push-log' });

    await expect(canAccessLead(user, lead)).resolves.toBe(false);
    await expect(canEditLead(user, lead)).resolves.toBe(false);
  });

  it('does not grant a scheduled site-visit assignee access to another owner lead', async () => {
    db.siteVisitFindFirst.mockResolvedValue({ id: 'scheduled-visit' });

    await expect(canAccessLead(user, lead)).resolves.toBe(false);
    await expect(canEditLead(user, lead)).resolves.toBe(false);
  });

  it('does not grant a recorded SVC/Sales recipient access to another owner’s lead', async () => {
    db.rrQueueHistoryFindFirst.mockResolvedValue({ id: 'assignment' });

    await expect(canAccessLead(user, lead)).resolves.toBe(false);
    await expect(canEditLead(user, lead)).resolves.toBe(false);
  });

  it('does not grant access to users without a handoff or active site-visit share', async () => {
    await expect(canAccessLead(user, lead)).resolves.toBe(false);
    await expect(canEditLead(user, lead)).resolves.toBe(false);
  });

  it('keeps ordinary users owner-scoped', async () => {
    await expect(getLeadRecordScope(user)).resolves.toEqual({ type: 'OWNER', userId: user.id });
  });

  it('lets View All read every tenant lead but does not permit editing', async () => {
    db.canViewAll.mockResolvedValue(true);

    await expect(getLeadRecordScope(user)).resolves.toEqual({ type: 'ALL' });
    await expect(canAccessLead(user, lead)).resolves.toBe(true);
    await expect(canEditLead(user, lead)).resolves.toBe(false);
  });

  it('lets Edit All update any lead when base read/update permissions are effective', async () => {
    db.canViewAll.mockResolvedValue(true);
    db.canEditAll.mockResolvedValue(true);

    await expect(canAccessLead(user, lead)).resolves.toBe(true);
    await expect(canEditLead(user, lead)).resolves.toBe(true);
  });

  it('does not let all-leads grants cross tenant boundaries', async () => {
    db.canViewAll.mockResolvedValue(true);
    db.canEditAll.mockResolvedValue(true);

    await expect(canAccessLead(user, { ...lead, tenantId: 'other-tenant' })).resolves.toBe(false);
    await expect(canEditLead(user, { ...lead, tenantId: 'other-tenant' })).resolves.toBe(false);
  });

  it('keeps task and activity scopes owner-based even when the user can view all leads', async () => {
    db.canViewAll.mockResolvedValue(true);

    await expect(getScopeClause(user, 'activity')).resolves.toEqual({ userId: { in: [user.id] } });
    await expect(getScopeClause(user, 'task')).resolves.toEqual({ ownerId: { in: [user.id] } });
  });

  it('scopes Call Detail reports to the call owner', async () => {
    await expect(getReportRecordAccessClause(user, 'Call Detail')).resolves.toEqual({
      OR: [
        { ownerId: { in: [user.id] } },
        { ownerId: null, createdById: { in: [user.id] } },
      ],
    });
  });

  it("scopes team reports to the user's role and descendant roles", async () => {
    db.userFindFirst.mockResolvedValue({ roleId: 'manager-role', roles: [] });
    db.roleFindMany.mockResolvedValue([
      { id: 'manager-role', parentRoleId: null },
      { id: 'team-role', parentRoleId: 'manager-role' },
      { id: 'nested-team-role', parentRoleId: 'team-role' },
      { id: 'unrelated-role', parentRoleId: null },
    ]);
    db.userFindMany.mockResolvedValue([{ id: user.id }, { id: 'team-user' }]);

    await expect(getReportRecordAccessClause(user, 'Lead', 'team')).resolves.toEqual({
      ownerId: { in: [user.id, 'team-user'] },
    });

    expect(db.userFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: user.tenantId,
        OR: [
          { id: user.id },
          { roleId: { in: ['team-role', 'nested-team-role'] } },
          { roles: { some: { roleId: { in: ['team-role', 'nested-team-role'] } } } },
        ],
      },
      select: { id: true },
    });
  });

  it('builds a hierarchy-only scope even when the user has view-all permissions', async () => {
    db.canViewAll.mockResolvedValue(true);
    db.userFindFirst.mockResolvedValue({ roleId: 'tl-role', roles: [] });
    db.roleFindMany.mockResolvedValue([
      { id: 'tl-role', parentRoleId: 'head-role' },
      { id: 'tm-role', parentRoleId: 'tl-role' },
      { id: 'other-tl-role', parentRoleId: 'head-role' },
    ]);
    db.userFindMany.mockResolvedValue([{ id: user.id }, { id: 'tm-user' }]);

    await expect(getHierarchyRecordScope(user)).resolves.toEqual({
      type: 'TEAM',
      userIds: [user.id, 'tm-user'],
    });
  });

  it('allows team report scope without allowing owner-scoped users to select all records', async () => {
    await expect(resolveReportShowMe(user, 'team')).resolves.toBe('team');
    await expect(resolveReportShowMe(user, 'all')).resolves.toBe('mine');
  });

  it('scopes related report objects to the same visible user IDs', async () => {
    const userIds = [user.id, 'team-user'];

    await expect(getReportRecordAccessClause(user, 'Project', 'team', userIds)).resolves.toEqual({
      leads: { some: { ownerId: { in: userIds } } },
    });
    await expect(getReportRecordAccessClause(user, 'Unit', 'team', userIds)).resolves.toEqual({
      OR: [
        { ownerId: { in: userIds } },
        { customerLead: { ownerId: { in: userIds } } },
        { bookingLead: { ownerId: { in: userIds } } },
        { opportunityLead: { ownerId: { in: userIds } } },
        { bookings: { some: { OR: [{ ownerId: { in: userIds } }, { lead: { ownerId: { in: userIds } } }] } } },
      ],
    });
    await expect(getReportRecordAccessClause(user, 'RRQueueMember', 'team', userIds)).resolves.toEqual({
      userId: { in: userIds },
    });
    await expect(getReportRecordAccessClause(user, 'User', 'team', userIds)).resolves.toEqual({
      id: { in: userIds },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  userRoleFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  userFindMany: vi.fn(),
  roleFindMany: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    userRole: { findMany: database.userRoleFindMany },
    user: {
      findFirst: database.userFindFirst,
      findMany: database.userFindMany,
    },
    role: { findMany: database.roleFindMany },
  },
}));

vi.mock('./effectivePermissions', () => ({
  EffectivePermissionService: {
    getEffectivePermissionsCached: vi.fn().mockResolvedValue([]),
    hasPermissionIn: vi.fn().mockReturnValue(false),
  },
}));
import {
  canAccessFollowUpRecord,
  followUpAccessWhere,
  followUpOwnerClause,
  followUpReportShowMe,
  followUpWriteAccessWhere,
} from './followUpAccess';
import { getScopeClause } from './recordAccess';

const owner = { id: 'user-a', tenantId: 'tenant-a', isAdmin: false, isSuperAdmin: false };
const admin = { id: 'admin-a', tenantId: 'tenant-a', isAdmin: true, isSuperAdmin: false };
const systemAdmin = { id: 'sys-a', tenantId: 'tenant-a', isAdmin: false, isSuperAdmin: true };

beforeEach(() => {
  vi.clearAllMocks();
  database.userRoleFindMany.mockResolvedValue([]);
  database.userFindFirst.mockResolvedValue({ roleId: null, roles: [] });
  database.userFindMany.mockResolvedValue([]);
  database.roleFindMany.mockResolvedValue([]);
});

describe('followUpAccessWhere', () => {
  it('limits a non-admin to follow-ups they own', async () => {
    await expect(followUpAccessWhere(owner)).resolves.toEqual({ tenantId: 'tenant-a', ownerId: { in: ['user-a'] } });
    await expect(followUpOwnerClause(owner)).resolves.toEqual({ ownerId: { in: ['user-a'] } });
  });

  it('lets an admin and a system admin see every follow-up in the tenant', async () => {
    await expect(followUpAccessWhere(admin)).resolves.toEqual({ tenantId: 'tenant-a' });
    await expect(followUpAccessWhere(systemAdmin, 'other-tenant')).resolves.toEqual({ tenantId: 'other-tenant' });
    await expect(followUpOwnerClause(admin)).resolves.toEqual({});
  });

  it('keeps follow-up writes owner-only unless the user is an admin', () => {
    expect(followUpWriteAccessWhere(owner)).toEqual({ tenantId: 'tenant-a', ownerId: 'user-a' });
    expect(followUpWriteAccessWhere(admin)).toEqual({ tenantId: 'tenant-a' });
  });

  it('moves access to the new owner and hides the row from the previous owner', async () => {
    const followUp = { tenantId: 'tenant-a', ownerId: 'user-a' };
    await expect(canAccessFollowUpRecord(owner, followUp)).resolves.toBe(true);
    await expect(canAccessFollowUpRecord({ ...owner, id: 'user-b' }, followUp)).resolves.toBe(false);

    followUp.ownerId = 'user-b';
    await expect(canAccessFollowUpRecord(owner, followUp)).resolves.toBe(false);
    await expect(canAccessFollowUpRecord({ ...owner, id: 'user-b' }, followUp)).resolves.toBe(true);
  });

  it('does not grant access through another tenant or through lead visibility', async () => {
    await expect(canAccessFollowUpRecord(owner, { tenantId: 'tenant-b', ownerId: 'user-a' })).resolves.toBe(false);
    await expect(canAccessFollowUpRecord(admin, { tenantId: 'tenant-b', ownerId: 'someone' })).resolves.toBe(false);
    await expect(canAccessFollowUpRecord(systemAdmin, { tenantId: 'tenant-b', ownerId: 'someone' })).resolves.toBe(true);
  });

  it('includes users assigned to descendant roles', async () => {
    database.userFindFirst.mockResolvedValue({ roleId: 'manager-role', roles: [] });
    database.roleFindMany.mockResolvedValue([
      { id: 'manager-role', parentRoleId: null },
      { id: 'employee-role', parentRoleId: 'manager-role' },
      { id: 'other-role', parentRoleId: null },
    ]);
    database.userFindMany.mockResolvedValue([{ id: 'user-a' }, { id: 'employee-a' }]);

    await expect(followUpAccessWhere(owner)).resolves.toEqual({
      tenantId: 'tenant-a',
      ownerId: { in: ['user-a', 'employee-a'] },
    });
    await expect(canAccessFollowUpRecord(owner, { tenantId: 'tenant-a', ownerId: 'employee-a' })).resolves.toBe(true);
    await expect(canAccessFollowUpRecord(owner, { tenantId: 'tenant-a', ownerId: 'outside-user' })).resolves.toBe(false);
  });

  it('preserves the requested report scope for hierarchy-based row filtering', () => {
    expect(followUpReportShowMe('FollowUp', owner, 'all')).toBe('all');
    expect(followUpReportShowMe('FollowUp', owner, 'team')).toBe('team');
    expect(followUpReportShowMe('FollowUp', admin, 'all')).toBe('all');
    expect(followUpReportShowMe('FollowUp', admin, 'team')).toBe('team');
    expect(followUpReportShowMe('Lead', owner, 'all')).toBe('all');
  });
});

describe('getScopeClause follow-ups', () => {
  it('limits follow-ups to the user hierarchy, and nothing extra for admins', async () => {
    await expect(getScopeClause(owner, 'followUp')).resolves.toEqual({ ownerId: { in: ['user-a'] } });
    await expect(getScopeClause(admin, 'followUp')).resolves.toBeNull();
  });
});

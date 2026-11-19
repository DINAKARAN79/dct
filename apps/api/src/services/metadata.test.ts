import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  fieldFindMany: vi.fn(),
  objectFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  userFindMany: vi.fn(),
  roleFindMany: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    fieldDefinition: {
      findMany: database.fieldFindMany,
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    objectDefinition: { findFirst: database.objectFindFirst },
    user: {
      findFirst: database.userFindFirst,
      findMany: database.userFindMany,
    },
    role: { findMany: database.roleFindMany },
  },
}));

import { getAllFieldDefinitions, getRoleHierarchyUserIds } from './metadata';

beforeEach(() => {
  vi.clearAllMocks();
  database.fieldFindMany.mockResolvedValue([
    { name: 'svc_call_summary_remarks', isActive: true, visible: true },
  ]);
  database.objectFindFirst.mockResolvedValue({ id: 'lead-object-a', name: 'Lead' });
});

describe('getAllFieldDefinitions', () => {
  it('includes virtual standard Lead fields alongside Prospect custom fields', async () => {
    const fields = await getAllFieldDefinitions('tenant-a', 'lead-object-a', 'Lead');
    const fieldNames = fields.map((field) => field.name);

    expect(fieldNames).toContain('svc_call_summary_remarks');
    expect(fieldNames).toContain('firstName');
    expect(fieldNames).toContain('status');
  });

  it('does not query the object again for non-Lead objects with configured fields', async () => {
    const configuredField = { name: 'name', isActive: true, visible: true };
    database.fieldFindMany.mockResolvedValueOnce([configuredField]);

    const fields = await getAllFieldDefinitions('tenant-a', 'project-object-a', 'Project');

    expect(fields).toEqual([configuredField]);
    expect(database.objectFindFirst).not.toHaveBeenCalled();
  });
});

describe('getRoleHierarchyUserIds', () => {
  it('includes the user and descendant-role users, but excludes peers in the same role', async () => {
    database.userFindFirst.mockResolvedValue({ roleId: 'tm-role', roles: [] });
    database.roleFindMany.mockResolvedValue([
      { id: 'head-role', parentRoleId: null },
      { id: 'tl-role', parentRoleId: 'head-role' },
      { id: 'tm-role', parentRoleId: 'tl-role' },
      { id: 'other-tm-role', parentRoleId: 'tl-role' },
      { id: 'other-tl-role', parentRoleId: 'head-role' },
    ]);
    database.userFindMany.mockResolvedValue([{ id: 'tm-user' }]);

    await expect(getRoleHierarchyUserIds('tenant-a', 'tm-user')).resolves.toEqual(['tm-user']);
    expect(database.userFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        OR: [{ id: 'tm-user' }],
      },
      select: { id: true },
    });
  });

  it('includes descendant role users but not peers when the user has a child role', async () => {
    database.userFindFirst.mockResolvedValue({ roleId: 'tl-role', roles: [] });
    database.roleFindMany.mockResolvedValue([
      { id: 'head-role', parentRoleId: null },
      { id: 'tl-role', parentRoleId: 'head-role' },
      { id: 'tm-role', parentRoleId: 'tl-role' },
      { id: 'other-tm-role', parentRoleId: 'tl-role' },
      { id: 'other-tl-role', parentRoleId: 'head-role' },
    ]);
    database.userFindMany.mockResolvedValue([{ id: 'tl-user' }, { id: 'tm-user' }]);

    await expect(getRoleHierarchyUserIds('tenant-a', 'tl-user')).resolves.toEqual(['tl-user', 'tm-user']);
    expect(database.userFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        OR: [
          { id: 'tl-user' },
          { roleId: { in: ['tm-role', 'other-tm-role'] } },
          { roles: { some: { roleId: { in: ['tm-role', 'other-tm-role'] } } } },
        ],
      },
      select: { id: true },
    });
  });

  it('uses the single assigned role when the primary role field is stale', async () => {
    database.userFindFirst.mockResolvedValue({ roleId: 'old-role', roles: [{ roleId: 'tl-role' }] });
    database.roleFindMany.mockResolvedValue([
      { id: 'old-role', parentRoleId: null },
      { id: 'old-child-role', parentRoleId: 'old-role' },
      { id: 'tl-role', parentRoleId: 'head-role' },
      { id: 'tm-role', parentRoleId: 'tl-role' },
    ]);
    database.userFindMany.mockResolvedValue([{ id: 'tl-user' }, { id: 'tm-user' }]);

    await expect(getRoleHierarchyUserIds('tenant-a', 'tl-user')).resolves.toEqual(['tl-user', 'tm-user']);
    expect(database.userFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        OR: [
          { id: 'tl-user' },
          { roleId: { in: ['tm-role'] } },
          { roles: { some: { roleId: { in: ['tm-role'] } } } },
        ],
      },
      select: { id: true },
    });
  });
});

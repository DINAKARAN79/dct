import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  objectFindFirst: vi.fn(),
  assignmentFindFirst: vi.fn(),
  layoutFindFirst: vi.fn(),
}));

const metadata = vi.hoisted(() => ({
  getAllFieldDefinitions: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    objectDefinition: { findFirst: database.objectFindFirst },
    layoutAssignment: { findFirst: database.assignmentFindFirst },
    pageLayout: { findFirst: database.layoutFindFirst },
  },
}));

vi.mock('./metadata', () => metadata);

import { emptyLayoutDocument } from '@dct-crm/shared';
import type { AuthRequest } from '../middleware/auth';
import { layoutWriteError, resolveAssignedLayout } from './layoutAccess';

const object = { id: 'lead-object', name: 'Lead' };
const assignedLayout = { id: 'assigned-layout', name: 'Custom Lead' };
const profileLayout = { id: 'profile-layout', name: 'Sales' };
const defaultLayout = { id: 'default-layout', name: 'Default', isDefault: true };

describe('resolveAssignedLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.objectFindFirst.mockResolvedValue(object);
    database.assignmentFindFirst.mockResolvedValue(null);
    database.layoutFindFirst.mockResolvedValue(null);
  });

  it('prefers an explicit profile assignment', async () => {
    database.assignmentFindFirst.mockResolvedValue({ layoutId: assignedLayout.id });
    database.layoutFindFirst.mockResolvedValue(assignedLayout);

    await expect(resolveAssignedLayout('tenant-1', 'profile-1', 'Lead', 'Sales'))
      .resolves.toBe(assignedLayout);
    expect(database.layoutFindFirst).toHaveBeenCalledWith({
      where: { id: assignedLayout.id, tenantId: 'tenant-1', objectId: object.id },
    });
  });

  describe('layoutWriteError', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      database.objectFindFirst.mockResolvedValue(object);
      database.assignmentFindFirst.mockResolvedValue(null);

      const document = emptyLayoutDocument('Sales');
      document.sections[0].items = [
        {
          id: 'lead-id',
          type: 'field',
          fieldApiName: 'id',
          column: 1,
          row: 0,
          readOnly: false,
          required: true,
        },
        {
          id: 'last-name',
          type: 'field',
          fieldApiName: 'lastName',
          column: 1,
          row: 1,
          readOnly: false,
          required: true,
        },
      ];
      database.layoutFindFirst.mockResolvedValue({
        id: 'sales-layout',
        name: 'Sales',
        objectId: object.id,
        sections: document,
      });
      metadata.getAllFieldDefinitions.mockResolvedValue([
        { name: 'id', label: 'Lead ID', required: true, isSystemField: true, editable: false },
        { name: 'lastName', label: 'Last Name', required: true, isSystemField: true, editable: true },
      ]);
    });

    it('does not require a generated, non-editable ID when creating a lead', async () => {
      const req = {
        tenantId: 'tenant-1',
        user: { profileId: 'profile-1' },
      } as AuthRequest;

      await expect(layoutWriteError(req, 'Lead', { lastName: 'Smith' })).resolves.toBeNull();
    });

    it('continues enforcing required editable fields on the layout', async () => {
      const req = {
        tenantId: 'tenant-1',
        user: { profileId: 'profile-1' },
      } as AuthRequest;

      await expect(layoutWriteError(req, 'Lead', {})).resolves.toBe('lastName is required on this page layout');
    });
  });

  it('uses a layout named for the profile when no explicit assignment exists', async () => {
    database.layoutFindFirst.mockResolvedValueOnce(profileLayout);

    await expect(resolveAssignedLayout('tenant-1', 'profile-1', 'Lead', ' Sales '))
      .resolves.toBe(profileLayout);
    expect(database.layoutFindFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        objectId: object.id,
        name: { equals: 'Sales', mode: 'insensitive' },
      },
    });
  });

  it('falls back to the default layout when no profile layout matches', async () => {
    database.layoutFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(defaultLayout);

    await expect(resolveAssignedLayout('tenant-1', 'profile-1', 'Lead', 'Sales'))
      .resolves.toBe(defaultLayout);
    expect(database.layoutFindFirst).toHaveBeenLastCalledWith({
      where: { tenantId: 'tenant-1', objectId: object.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  });
});

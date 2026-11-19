import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  leadFindFirst: vi.fn(),
  leadUpdate: vi.fn(),
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: vi.fn(),
  transactionUserFindUnique: vi.fn(),
  followUpUpdateMany: vi.fn(),
  siteVisitUpdateMany: vi.fn(),
  auditLogCreate: vi.fn(),
  hasPermission: vi.fn(),
  canEditLead: vi.fn(),
  createOwnerHistory: vi.fn(),
  appendLeadProcessNote: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    lead: { findFirst: mocks.leadFindFirst },
    user: {
      findFirst: mocks.userFindFirst,
      findUnique: mocks.userFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./effectivePermissions', () => ({
  EffectivePermissionService: { hasPermission: mocks.hasPermission },
}));
vi.mock('./recordAccess', () => ({
  canEditLead: mocks.canEditLead,
  getRecordScope: vi.fn().mockResolvedValue({ type: 'ALL' }),
}));
vi.mock('./ownerHistory', () => ({ createOwnerHistory: mocks.createOwnerHistory }));
vi.mock('./leadNotes', () => ({ appendLeadProcessNote: mocks.appendLeadProcessNote }));

import { changeLeadOwner } from './leadOwnerChange';

describe('manual lead owner change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.leadFindFirst.mockResolvedValue({
      id: 'lead-1',
      tenantId: 'tenant-1',
      ownerId: 'old-owner',
      status: 'LOST',
      customFields: { sf_Lead_Status__c: 'Recovery - Sales' },
      owner: { id: 'old-owner', firstName: 'Old', lastName: 'Owner' },
    });
    mocks.leadUpdate.mockResolvedValue({
      id: 'lead-1',
      owner: { id: 'new-owner', firstName: 'New', lastName: 'Owner' },
    });
    mocks.userFindFirst.mockResolvedValue({
      id: 'new-owner',
      tenantId: 'tenant-1',
      firstName: 'New',
      lastName: 'Owner',
      profile: { name: 'Sales' },
    });
    mocks.userFindUnique.mockResolvedValue({ firstName: 'Admin', lastName: 'User' });
    mocks.transactionUserFindUnique.mockResolvedValue({ profile: { name: 'Old Profile' } });
    mocks.hasPermission.mockResolvedValue(true);
    mocks.canEditLead.mockResolvedValue(true);
    mocks.followUpUpdateMany.mockResolvedValue({ count: 1 });
    mocks.siteVisitUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((callback) => callback({
      lead: { update: mocks.leadUpdate },
      followUp: { updateMany: mocks.followUpUpdateMany },
      siteVisit: { updateMany: mocks.siteVisitUpdateMany },
      user: { findUnique: mocks.transactionUserFindUnique },
      auditLog: { create: mocks.auditLogCreate },
    }));
  });

  it('reassigns scheduled follow-ups and site visits in the owner-change transaction', async () => {
    await changeLeadOwner({
      leadId: 'lead-1',
      newOwnerId: 'new-owner',
      changedBy: { id: 'admin-1', tenantId: 'tenant-1' },
    });

    expect(mocks.followUpUpdateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', leadId: 'lead-1', status: 'SCHEDULED' },
      data: { ownerId: 'new-owner', assignedToId: 'new-owner' },
    });
    expect(mocks.siteVisitUpdateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', leadId: 'lead-1', status: 'SCHEDULED' },
      data: { assigneeId: 'new-owner' },
    });
  });
});

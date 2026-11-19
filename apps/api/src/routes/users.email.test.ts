import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  userDelete: vi.fn(),
  userRoleDeleteMany: vi.fn(),
  userRoleCreateMany: vi.fn(),
  roleCount: vi.fn(),
  transaction: vi.fn(),
  tenantFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
}));
const sessions = vi.hoisted(() => ({ endAllUserSessions: vi.fn() }));
const access = vi.hoisted(() => ({ getRecordScope: vi.fn() }));
const authState = vi.hoisted(() => ({ isAdmin: true, isSuperAdmin: false }));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    user: {
      findFirst: database.userFindFirst,
      findUnique: database.userFindUnique,
      update: database.userUpdate,
      delete: database.userDelete,
    },
    userRole: {
      deleteMany: database.userRoleDeleteMany,
      createMany: database.userRoleCreateMany,
    },
    role: { count: database.roleCount },
    tenant: { findUnique: database.tenantFindUnique },
    auditLog: { create: database.auditLogCreate },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'admin-1',
      tenantId: 'tenant-1',
      isAdmin: authState.isAdmin,
      isSuperAdmin: authState.isSuperAdmin,
    };
    req.tenantId = 'tenant-1';
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: (object: string, action: string) => (_req: any, res: any, next: any) => {
    if (object === 'User' && action === 'delete') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    return next();
  },
}));

vi.mock('../services/recordAccess', () => ({
  getRecordScope: access.getRecordScope,
}));

vi.mock('../services/userPresence', () => ({
  endAllUserSessions: sessions.endAllUserSessions,
  liveOnlineUserIds: vi.fn(),
  rejectManagedUserFields: vi.fn(),
}));

import { userRoutes as usersRouter } from './users';

const servers: Server[] = [];

async function updateUser(body: Record<string, unknown>, userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function updateUserRoles(roleIds: string[], userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/users/${userId}/roles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleIds }),
  });
}

async function deleteUser(userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/users/${userId}`, { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.isAdmin = true;
  authState.isSuperAdmin = false;
  access.getRecordScope.mockResolvedValue({ type: 'ALL' });
  database.userFindFirst.mockResolvedValue({
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'old@example.com',
    phone: '+14155550123',
    profileId: null,
    roleId: 'role-old',
  });
  database.tenantFindUnique.mockResolvedValue({ country: 'US' });
  database.userUpdate.mockImplementation(async ({ data }: any) => ({
    id: 'user-1',
    email: data.email || 'old@example.com',
    firstName: 'Sam',
    lastName: '',
    phone: '+14155550123',
  }));
  database.userDelete.mockResolvedValue({ id: 'user-1' });
  database.auditLogCreate.mockResolvedValue({});
  database.userRoleDeleteMany.mockResolvedValue({ count: 1 });
  database.userRoleCreateMany.mockResolvedValue({ count: 1 });
  database.roleCount.mockImplementation(async ({ where }: any) => where.id.in.length);
  database.userFindUnique.mockResolvedValue({
    id: 'user-1',
    email: 'old@example.com',
    firstName: 'Sam',
    lastName: '',
    profileId: null,
    profile: null,
    roles: [{ roleId: 'role-next', role: { id: 'role-next', name: 'Next Role' } }],
  });
  database.transaction.mockImplementation((callback: (tx: any) => Promise<unknown>) => callback({
    userRole: {
      deleteMany: database.userRoleDeleteMany,
      createMany: database.userRoleCreateMany,
    },
    user: { update: database.userUpdate },
  }));
  sessions.endAllUserSessions.mockResolvedValue(undefined);
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('PUT /users/:id email changes', () => {
  it('hides user details outside the requester scope', async () => {
    access.getRecordScope.mockResolvedValue({ type: 'OWNER', userId: 'admin-1' });

    const response = await updateUser({}, 'user-1');

    expect(response.status).toBe(404);
    expect(database.userFindFirst).not.toHaveBeenCalled();
  });

  describe('DELETE /users/:id', () => {
    it('allows Admins to permanently delete another user', async () => {
      const response = await deleteUser();

      expect(response.status).toBe(200);
      expect(database.userFindFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', tenantId: 'tenant-1' },
      });
      expect(database.userDelete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('allows Super Admins to permanently delete another user', async () => {
      authState.isAdmin = false;
      authState.isSuperAdmin = true;

      const response = await deleteUser();

      expect(response.status).toBe(200);
      expect(database.userDelete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('rejects users who are neither Admin nor authorized to delete users', async () => {
      authState.isAdmin = false;

      const response = await deleteUser();

      expect(response.status).toBe(403);
      expect(database.userFindFirst).not.toHaveBeenCalled();
      expect(database.userDelete).not.toHaveBeenCalled();
    });

    it('prevents Admins from deleting their own account', async () => {
      const response = await deleteUser('admin-1');

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        success: false,
        error: 'Cannot delete your own account',
      });
      expect(database.userDelete).not.toHaveBeenCalled();
    });
  });

  describe('PUT /users/:id/roles', () => {
    it('updates the primary role when removing the user from a role', async () => {
      const response = await updateUserRoles(['role-next']);

      expect(response.status).toBe(200);
      expect(database.userRoleDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(database.userRoleCreateMany).toHaveBeenCalledWith({
        data: [{ userId: 'user-1', roleId: 'role-next' }],
      });
      expect(database.userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { roleId: 'role-next' },
      });
    });
  });

  it('normalizes, audits, and revokes sessions after an email change without changing the user ID', async () => {
    database.userFindFirst
      .mockResolvedValueOnce({ id: 'user-1', tenantId: 'tenant-1', email: 'old@example.com', phone: '+14155550123', profileId: null })
      .mockResolvedValueOnce(null);

    const response = await updateUser({ email: '  Sam@Example.COM  ' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { id: 'user-1', email: 'sam@example.com' },
    });
    expect(database.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({ email: 'sam@example.com' }),
    }));
    expect(sessions.endAllUserSessions).toHaveBeenCalledWith('user-1', 'tenant-1', 'REVOKED');
    expect(database.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        objectId: 'user-1',
        oldValues: expect.objectContaining({ email: 'old@example.com' }),
        newValues: expect.objectContaining({ email: 'sam@example.com' }),
      }),
    }));
  });

  it('returns a tenant-scoped conflict without updating or revoking sessions', async () => {
    database.userFindFirst
      .mockResolvedValueOnce({ id: 'user-1', tenantId: 'tenant-1', email: 'old@example.com', phone: '+14155550123', profileId: null })
      .mockResolvedValueOnce({ id: 'other-user' });

    const response = await updateUser({ email: 'TAKEN@example.com' });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, error: 'This email is already being used in this company.' });
    expect(database.userUpdate).not.toHaveBeenCalled();
    expect(sessions.endAllUserSessions).not.toHaveBeenCalled();
  });

  it('maps a concurrent tenant email unique-constraint conflict to 409', async () => {
    database.userFindFirst
      .mockResolvedValueOnce({ id: 'user-1', tenantId: 'tenant-1', email: 'old@example.com', phone: '+14155550123', profileId: null })
      .mockResolvedValueOnce(null);
    database.userUpdate.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['tenantId', 'email'] },
    });

    const response = await updateUser({ email: 'taken@example.com' });

    expect(response.status).toBe(409);
    expect(sessions.endAllUserSessions).not.toHaveBeenCalled();
  });
});

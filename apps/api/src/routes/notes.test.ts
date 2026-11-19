import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  leadFindFirst: vi.fn(),
  leadUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    lead: { findFirst: database.leadFindFirst },
    user: { findUnique: database.userFindUnique },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1' };
    req.tenantId = 'tenant-1';
    next();
  },
}));

vi.mock('../services/effectivePermissions', () => ({
  EffectivePermissionService: {
    getEffectivePermissionsCached: vi.fn().mockResolvedValue([]),
    hasPermissionIn: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../services/recordAccess', () => ({
  canAccessLead: vi.fn().mockResolvedValue(true),
  canEditLead: vi.fn().mockResolvedValue(true),
}));

vi.mock('../services/tenantTimezone', () => ({
  getTenantTimezone: vi.fn().mockResolvedValue('UTC'),
}));

import notesRouter from './notes';

const servers: Server[] = [];

async function addNote(body: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use('/api/notes', notesRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/notes/lead-1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  database.leadFindFirst.mockResolvedValue({
    id: 'lead-1',
    tenantId: 'tenant-1',
    notes: null,
    ownerId: 'user-1',
    creatorId: 'user-1',
  });
  database.userFindUnique.mockResolvedValue({ firstName: 'Test', lastName: 'User' });
  database.leadUpdate.mockResolvedValue({});
  database.auditLogCreate.mockResolvedValue({});
  database.transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRaw: vi.fn().mockResolvedValue([]),
      lead: {
        findFirst: database.leadFindFirst,
        update: database.leadUpdate,
      },
      auditLog: { create: database.auditLogCreate },
    }),
  );
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('POST /api/notes/:recordId', () => {
  it('stores the supplied title with the note content', async () => {
    const response = await addNote({ title: 'Call back', note: 'Discussed the next steps.' });

    expect(response.status).toBe(200);
    expect(database.leadUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { notes: expect.stringContaining('[[CRM_NOTE_TITLE]]Call back\nDiscussed the next steps.') },
    }));
    expect(database.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ newValues: { title: 'Call back', note: 'Discussed the next steps.' } }),
    }));
  });

  it('requires a title', async () => {
    const response = await addNote({ note: 'Discussed the next steps.' });

    expect(response.status).toBe(400);
    expect(database.leadUpdate).not.toHaveBeenCalled();
  });
});

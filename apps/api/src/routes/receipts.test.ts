import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  leadFindFirst: vi.fn(),
  leadLandAmountFind: vi.fn(),
  leadLandAmountUpdateMany: vi.fn(),
  receiptFindMany: vi.fn(),
  receiptFindManyForBooking: vi.fn(),
  receiptFindFirst: vi.fn(),
  receiptFindLeadHistory: vi.fn(),
  receiptFindTransaction: vi.fn(),
  receiptFindStage: vi.fn(),
  receiptAggregate: vi.fn(),
  receiptCreate: vi.fn(),
  refundRequestFindMany: vi.fn(),
  refundRequestFindIdempotency: vi.fn(),
  refundRequestFindReference: vi.fn(),
  refundRequestFindForReview: vi.fn(),
  refundRequestAggregate: vi.fn(),
  refundRequestCreate: vi.fn(),
  refundRequestUpdateMany: vi.fn(),
  bookingFindFirst: vi.fn(),
  sequenceUpsert: vi.fn(),
  transaction: vi.fn(),
  receiptUpdateMany: vi.fn(),
  bookingUpdateMany: vi.fn(),
  unitUpdateMany: vi.fn(),
  moveLeadToBookedBucket: vi.fn(),
  tenantFindFirst: vi.fn(),
  reviewer: { id: '', profileName: 'MIS', isAdmin: false, isSuperAdmin: false },
}));
const recordAccess = vi.hoisted(() => ({
  getReportRecordAccessClause: vi.fn(async (): Promise<{ ownerId: string } | null> => null),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    lead: { findFirst: database.leadFindFirst },
    receipt: {
      findMany: database.receiptFindMany,
      findFirst: database.receiptFindFirst,
    },
    tenant: { findFirst: database.tenantFindFirst },
    refundRequest: {
      findMany: database.refundRequestFindMany,
    },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: ExpressResponse, next: NextFunction) => {
    Object.assign(req, { user: { ...database.reviewer, tenantId: 'tenant-a' } });
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
  authorizeEffectivePermission: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
}));

vi.mock('../middleware/audit', () => ({ auditLog: vi.fn() }));
vi.mock('../services/recordAccess', () => ({
  canAccessLead: vi.fn(async () => true),
  getReportRecordAccessClause: recordAccess.getReportRecordAccessClause,
}));
vi.mock('../services/rrQueue', () => ({
  assignLeadToProjectRoundRobinInTransaction: vi.fn(async () => ({
    assignedUserId: 'crm-a',
    queueId: 'crm-queue',
    memberId: 'crm-member',
  })),
}));
vi.mock('../services/bookedBucket', () => ({
  moveLeadToBookedBucket: database.moveLeadToBookedBucket,
}));

import receiptsRouter from './receipts';
import { RECEIPT_APPROVAL_REVIEWER_USER_IDS } from '@dct-crm/shared';

const servers: Server[] = [];
const lead = { id: 'lead-a', tenantId: 'tenant-a', ownerId: 'sales-a', creatorId: 'sales-a' };
const booking = {
  id: 'booking-a',
  tenantId: 'tenant-a',
  leadId: 'lead-a',
  status: 'RESERVED',
  quotation: {
    totalPrice: 100000,
    paymentPlan: {
      installments: [
        { milestone: 'On confirmation', percentage: 50, dueMonths: 0 },
        { milestone: 'On possession', percentage: 50, dueMonths: 6 },
      ],
    },
  },
};
const input = {
  bookingId: 'booking-a',
  receiptDate: '2026-10-15',
  receivedFrom: 'Asha Sharma',
  amount: 25000,
  paymentMode: 'UPI',
  transactionId: 'TXN-123',
  receivedDate: '2026-10-15',
};

function authenticateAsFinanceReviewer() {
  database.reviewer.id = 'finance-user';
  database.reviewer.profileName = 'Finance Team';
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/receipts', receiptsRouter);
  return app;
}

async function requestReview(receiptId: string, body: unknown) {
  const server = createApp().listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/approvals/${receiptId}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getApprovals() {
  const server = createApp().listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/approvals`);
}

async function getFinanceApprovals() {
  const server = createApp().listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/finance-approvals`);
}

async function requestReceipt(inputValue: unknown = input) {
  const server = createApp().listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/lead/lead-a`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(inputValue),
  });
}

async function reviewFinanceReceipt(receiptId: string, body: unknown) {
  const server = createApp().listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/finance-approvals/${receiptId}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function requestCustomerReceipt(inputValue: unknown = {
  receiptDate: '2026-10-15',
  receivedFrom: 'Asha Sharma',
  amount: 50000,
  paymentMode: 'UPI',
  transactionId: 'TXN-456',
  receivedDate: '2026-10-15',
}) {
  const server = createApp().listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/lead/lead-a/bookings/booking-a/customer-receipt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(inputValue),
  });
}

async function requestRefund(inputValue: unknown = {
  bookingId: 'booking-a',
  requestKey: 'refund-request-1',
  customerName: 'Asha Sharma',
  customerPhone: '9876543210',
  amount: 25000,
  reason: 'Customer request',
  refundReference: 'RF-1001',
}) {
  const server = createApp().listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/lead/lead-a/refunds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(inputValue),
  });
}

async function reviewRefund(refundId: string, body: unknown) {
  const server = createApp().listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/approvals/refunds/${refundId}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function requestPdf() {
  const server = createApp().listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/lead/lead-a/receipt-a/pdf`);
}

describe('receipts API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordAccess.getReportRecordAccessClause.mockResolvedValue(null);
    database.leadFindFirst.mockResolvedValue(lead);
    database.leadLandAmountFind.mockResolvedValue({ id: 'lead-a', totalLandAmount: 75000 });
    database.leadLandAmountUpdateMany.mockResolvedValue({ count: 1 });
    database.tenantFindFirst.mockResolvedValue(null);
    database.bookingFindFirst.mockResolvedValue(booking);
    database.receiptFindStage.mockResolvedValue(null);
    database.receiptFindLeadHistory.mockResolvedValue(null);
    database.receiptFindTransaction.mockResolvedValue(null);
    database.receiptAggregate.mockResolvedValue({ _sum: { amount: 50000 } });
    database.receiptFindManyForBooking.mockResolvedValue([{
      amount: 50000,
      kind: 'MIS_SUBMISSION',
      installmentIndex: null,
      receivedDate: new Date('2026-10-15T12:00:00.000Z'),
    }]);
    database.sequenceUpsert.mockResolvedValue({ nextValue: 1 });
    database.receiptCreate.mockImplementation(async ({ data, include }) => ({
      id: 'receipt-a',
      ...data,
      booking: {
        id: 'booking-a',
        bookingNumber: 'BK-2026-000001',
        project: { name: 'DCT Valley' },
        unit: { number: 'A-101', area: 1200 },
      },
      createdBy: { id: 'sales-a', firstName: 'Sales', lastName: 'Person' },
      include,
    }));
    database.refundRequestFindIdempotency.mockResolvedValue(null);
    database.refundRequestFindReference.mockResolvedValue(null);
    database.refundRequestFindForReview.mockResolvedValue({
      id: 'refund-a',
      tenantId: 'tenant-a',
      bookingId: 'booking-a',
      amount: 25000,
      refundReference: 'RF-1001',
      status: 'PENDING_APPROVAL',
    });
    database.refundRequestAggregate.mockResolvedValue({ _sum: { amount: 0 } });
    database.refundRequestUpdateMany.mockImplementation(async ({ data }) => {
      const current = await database.refundRequestFindForReview();
      database.refundRequestFindForReview.mockResolvedValue({ ...current, ...data });
      return { count: 1 };
    });
    database.refundRequestCreate.mockImplementation(async ({ data, include }) => ({
      id: 'refund-a',
      ...data,
      submittedAt: new Date('2026-10-15T12:00:00.000Z'),
      booking: { id: 'booking-a', bookingNumber: 'BK-2026-000001', project: { name: 'DCT Valley' }, unit: { number: 'A-101' } },
      lead: { id: 'lead-a', leadNumber: 'LD-1', firstName: 'Asha', lastName: 'Sharma', mobile: '9876543210', email: null },
      createdBy: { id: 'sales-a', firstName: 'Sales', lastName: 'Person' },
      include,
    }));
    database.receiptFindFirst.mockResolvedValue({
      id: 'receipt-a',
      receiptNumber: 'RC-2026-000001',
      kind: 'MIS_SUBMISSION',
      approvalStatus: 'PENDING_APPROVAL',
      approvalStage: 'MIS',
      misApprovalStatus: 'PENDING_APPROVAL',
      booking: {
        id: 'booking-a',
        leadId: 'lead-a',
        projectId: 'project-a',
        unitId: 'unit-a',
        status: 'RESERVED',
      },
    });
    database.receiptUpdateMany.mockResolvedValue({ count: 1 });
    database.bookingUpdateMany.mockResolvedValue({ count: 1 });
    database.unitUpdateMany.mockResolvedValue({ count: 1 });
    database.moveLeadToBookedBucket.mockResolvedValue({ moved: false, owner: null, usedFallback: false });
    database.transaction.mockImplementation(async (callback) => callback({
      receipt: {
        aggregate: database.receiptAggregate,
        create: database.receiptCreate,
        findMany: database.receiptFindManyForBooking,
        findFirst: vi.fn((args) => args.where?.transactionId
          ? database.receiptFindTransaction(args)
          : args.where?.leadId && !args.where?.kind
            ? database.receiptFindLeadHistory(args)
          : args.where?.kind === 'MIS_SUBMISSION'
            ? database.receiptFindStage(args)
            : database.receiptFindFirst(args)),
        updateMany: database.receiptUpdateMany,
      },
      refundRequest: {
        findFirst: vi.fn((args) => args.where?.requestKey
          ? database.refundRequestFindIdempotency(args)
          : args.where?.refundReference
            ? database.refundRequestFindReference(args)
            : database.refundRequestFindForReview(args)),
        aggregate: database.refundRequestAggregate,
        create: database.refundRequestCreate,
        updateMany: database.refundRequestUpdateMany,
      },
      unit: { updateMany: database.unitUpdateMany },
      lead: {
        findFirst: database.leadLandAmountFind,
        updateMany: database.leadLandAmountUpdateMany,
      },
      booking: {
        findFirst: database.bookingFindFirst,
        updateMany: database.bookingUpdateMany,
      },
      sequence: { upsert: database.sequenceUpsert },
    }));
    database.reviewer.id = RECEIPT_APPROVAL_REVIEWER_USER_IDS.mis;
    database.reviewer.profileName = 'MIS';
    database.reviewer.isAdmin = false;
    database.reviewer.isSuperAdmin = false;
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));
  });

  it('creates the first receipt in the MIS stage and assigns a tenant sequence number', async () => {
    const response = await requestReceipt();
    expect(response.status).toBe(201);
    expect(database.receiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        leadId: 'lead-a',
        bookingId: 'booking-a',
        receiptNumber: 'RC-2026-000001',
        amount: 25000,
        kind: 'MIS_SUBMISSION',
        approvalStatus: 'PENDING_APPROVAL',
        approvalStage: 'MIS',
        misApprovalStatus: 'PENDING_APPROVAL',
      }),
    }));
  });

  it('requires a transaction ID for receipts', async () => {
    const response = await requestReceipt({ ...input, transactionId: '' });
    expect(response.status).toBe(400);
    expect(database.receiptCreate).not.toHaveBeenCalled();
  });

  it('blocks duplicate transaction IDs within the tenant', async () => {
    database.receiptFindTransaction.mockResolvedValue({ id: 'existing-receipt' });
    const response = await requestReceipt();
    const body = await response.json() as { field: string; error: string };
    expect(response.status).toBe(409);
    expect(body.field).toBe('transactionId');
    expect(database.receiptFindTransaction).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', transactionId: input.transactionId },
    }));
    expect(database.receiptCreate).not.toHaveBeenCalled();
  });

  it('uses case-sensitive transaction ID uniqueness', async () => {
    const response = await requestReceipt({ ...input, transactionId: 'txn-123' });

    expect(response.status).toBe(201);
    expect(database.receiptFindTransaction).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', transactionId: 'txn-123' },
    }));
  });

  it('creates an idempotent refund request only against confirmed approved payments', async () => {
    database.bookingFindFirst.mockResolvedValue({ ...booking, status: 'CONFIRMED' });
    const response = await requestRefund();
    const body = await response.json() as { data: { status: string; amount: number } };

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({ status: 'PENDING_APPROVAL', amount: 25000 });
    expect(database.refundRequestCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        bookingId: 'booking-a',
        requestKey: 'refund-request-1',
        amount: 25000,
        refundReference: 'RF-1001',
        status: 'PENDING_APPROVAL',
      }),
    }));
    expect(database.refundRequestAggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        bookingId: 'booking-a',
        status: { in: ['PENDING_APPROVAL', 'APPROVED'] },
      }),
    }));
  });

  it('rejects refund amounts above the remaining paid balance', async () => {
    database.bookingFindFirst.mockResolvedValue({ ...booking, status: 'CONFIRMED' });
    const response = await requestRefund({
      bookingId: 'booking-a',
      requestKey: 'refund-request-2',
      customerName: 'Asha Sharma',
      amount: 50001,
      reason: 'Customer request',
      refundReference: 'RF-1002',
    });
    expect(response.status).toBe(409);
    expect(database.refundRequestCreate).not.toHaveBeenCalled();
  });

  it('allows refund requests for a MIS-approved booked booking with an eligible paid balance', async () => {
    database.bookingFindFirst.mockResolvedValue({ ...booking, status: 'BOOKED' });
    const response = await requestRefund({
      bookingId: 'booking-a',
      requestKey: 'refund-request-booked',
      customerName: 'Asha Sharma',
      amount: 25000,
      reason: 'Customer request',
      refundReference: 'RF-BOOKED-1',
    });

    expect(response.status).toBe(201);
    expect(database.refundRequestCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bookingId: 'booking-a', amount: 25000, status: 'PENDING_APPROVAL' }),
    }));
  });

  it('blocks duplicate refund references within the tenant', async () => {
    database.bookingFindFirst.mockResolvedValue({ ...booking, status: 'CONFIRMED' });
    database.refundRequestFindReference.mockResolvedValue({ id: 'existing-refund' });
    const response = await requestRefund({
      bookingId: 'booking-a',
      requestKey: 'refund-request-3',
      customerName: 'Asha Sharma',
      amount: 1000,
      reason: 'Customer request',
      refundReference: 'RF-1001',
    });
    const body = await response.json() as { field: string };
    expect(response.status).toBe(409);
    expect(body.field).toBe('refundReference');
    expect(database.refundRequestCreate).not.toHaveBeenCalled();
  });

  it('lets MIS approve a refund without changing the booking', async () => {
    const response = await reviewRefund('refund-a', { decision: 'APPROVE', note: 'Verified' });
    const body = await response.json() as { data: { status: string } };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('APPROVED');
    expect(database.refundRequestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'refund-a', tenantId: 'tenant-a', status: 'PENDING_APPROVAL' },
      data: expect.objectContaining({
        status: 'APPROVED',
        reviewedById: RECEIPT_APPROVAL_REVIEWER_USER_IDS.mis,
        reviewNote: 'Verified',
      }),
    }));
    expect(database.bookingUpdateMany).not.toHaveBeenCalled();
    expect(database.unitUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects a payment that exceeds the remaining quotation balance', async () => {
    const response = await requestReceipt({ ...input, amount: 50001 });
    expect(response.status).toBe(409);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/remaining quotation balance/i);
    expect(database.receiptCreate).not.toHaveBeenCalled();
  });

  it('creates a subsequent CRM customer receipt for Finance approval after MIS approval', async () => {
    database.receiptFindStage.mockResolvedValue({ id: 'initial-receipt' });
    const response = await requestCustomerReceipt({ receiptDate: '2026-10-15', receivedFrom: 'Asha Sharma', amount: 50000, paymentMode: 'UPI', transactionId: 'TXN-CUSTOMER-1', receivedDate: '2026-10-15' });
    expect(response.status).toBe(201);
    expect(database.receiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        leadId: 'lead-a',
        bookingId: 'booking-a',
        receiptNumber: 'RC-2026-000001',
        kind: 'CRM_PAYMENT',
        approvalStatus: 'PENDING_APPROVAL',
        approvalStage: 'FINANCE',
        financeApprovalStatus: 'PENDING_APPROVAL',
        amount: 50000,
      }),
    }));
  });

  it('updates the remaining payment balance only for approved refunds', async () => {
    database.receiptFindStage.mockResolvedValue({ id: 'initial-receipt' });
    database.refundRequestAggregate.mockResolvedValue({ _sum: { amount: 10000 } });
    const response = await requestCustomerReceipt({
      receiptDate: '2026-10-15',
      receivedFrom: 'Asha Sharma',
      amount: 60000,
      paymentMode: 'UPI',
      transactionId: 'TXN-CUSTOMER-REFUND-1',
      receivedDate: '2026-10-15',
    });
    expect(response.status).toBe(201);
    expect(database.refundRequestAggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', bookingId: 'booking-a', status: 'APPROVED' },
    }));
  });

  it('rejects a CRM customer receipt when the amount exceeds the remaining balance', async () => {
    database.receiptFindStage.mockResolvedValue({ id: 'initial-receipt' });
    const response = await requestCustomerReceipt({ amount: 50001, receiptDate: '2026-10-15', receivedFrom: 'Asha Sharma', paymentMode: 'UPI', transactionId: 'TXN-CUSTOMER-2', receivedDate: '2026-10-15' });
    expect(response.status).toBe(409);
    expect(database.receiptCreate).not.toHaveBeenCalled();
  });

  it('tracks CRM payment against an installment and rejects overpaying that installment', async () => {
    database.receiptFindStage.mockResolvedValue({ id: 'initial-receipt' });
    const response = await requestCustomerReceipt({
      receiptDate: '2026-10-15',
      receivedFrom: 'Asha Sharma',
      amount: 1,
      paymentMode: 'UPI',
      transactionId: 'TXN-CUSTOMER-3',
      receivedDate: '2026-10-15',
      installmentIndex: 0,
    });
    expect(response.status).toBe(409);
    expect(database.receiptCreate).not.toHaveBeenCalled();
  });

  it('rejects an installment payment that exceeds its remaining amount', async () => {
    database.receiptFindStage.mockResolvedValue({ id: 'initial-receipt' });
    database.receiptFindManyForBooking.mockResolvedValue([
      {
        amount: 50000,
        kind: 'MIS_SUBMISSION',
        installmentIndex: null,
        receivedDate: new Date('2026-10-15T12:00:00.000Z'),
      },
      {
        amount: 25000,
        kind: 'CRM_PAYMENT',
        installmentIndex: 1,
        receivedDate: new Date('2026-10-16T12:00:00.000Z'),
      },
    ]);
    const response = await requestCustomerReceipt({
      receiptDate: '2026-10-17',
      receivedFrom: 'Asha Sharma',
      amount: 25001,
      paymentMode: 'UPI',
      transactionId: 'TXN-CUSTOMER-4',
      receivedDate: '2026-10-17',
      installmentIndex: 1,
    });
    expect(response.status).toBe(409);
    expect(database.receiptCreate).not.toHaveBeenCalled();
  });

  it('creates a partial payment for the selected installment and saves its index', async () => {
    database.receiptFindStage.mockResolvedValue({ id: 'initial-receipt' });
    const response = await requestCustomerReceipt({
      receiptDate: '2026-10-15',
      receivedFrom: 'Asha Sharma',
      amount: 25000,
      paymentMode: 'UPI',
      transactionId: 'TXN-CUSTOMER-5',
      receivedDate: '2026-10-15',
      installmentIndex: 1,
    });
    expect(response.status).toBe(201);
    expect(database.receiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: 25000, installmentIndex: 1, kind: 'CRM_PAYMENT' }),
    }));
  });

  it('routes subsequent lead receipts directly to Finance, even while the first receipt is pending', async () => {
    database.receiptFindLeadHistory.mockResolvedValue({ id: 'initial-receipt' });
    const response = await requestReceipt();
    expect(response.status).toBe(201);
    expect(database.receiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        kind: 'CRM_PAYMENT',
        approvalStatus: 'PENDING_APPROVAL',
        approvalStage: 'FINANCE',
        financeApprovalStatus: 'PENDING_APPROVAL',
      }),
    }));
  });

  it('returns the approved receipt as a PDF', async () => {
    database.receiptFindFirst.mockResolvedValue({
      id: 'receipt-a',
      receiptNumber: 'RC-2026-000001',
      approvalStatus: 'APPROVED',
      receiptDate: new Date('2026-10-15T12:00:00.000Z'),
      receivedDate: new Date('2026-10-15T12:00:00.000Z'),
      receivedFrom: 'Asha Sharma',
      amount: 25000,
      paymentMode: 'UPI',
      transactionId: 'TXN-123',
      booking: {
        bookingNumber: 'BK-2026-000001',
        project: { name: 'DCT Valley', address: 'Main Road', city: 'Bengaluru' },
        unit: { number: 'A-101', area: 1200, type: 'Plot' },
        quotation: { pricePerSqFt: 1000, totalPrice: 100000 },
      },
    });
    const response = await requestPdf();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it('sends the complete approval queue to MIS Quotation Reviewer profiles and administrators', async () => {
    database.reviewer.profileName = 'MIS';
    database.reviewer.id = 'other-mis-user';
    const forbidden = await getApprovals();
    expect(forbidden.status).toBe(403);

    database.reviewer.profileName = 'MIS Quotation Reviewer';
    database.reviewer.id = 'mis-profile-user';
    recordAccess.getReportRecordAccessClause.mockResolvedValue({ ownerId: 'another-user' });
    database.receiptFindMany.mockResolvedValue([{ id: 'receipt-a', approvalStatus: 'PENDING_APPROVAL' }]);
    const response = await getApprovals();
    expect(response.status).toBe(200);
    expect(database.receiptFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-a',
        kind: 'MIS_SUBMISSION',
        approvalStage: { in: ['MIS', 'COMPLETED'] },
      },
      include: expect.objectContaining({ lead: expect.any(Object), booking: expect.any(Object) }),
    }));
    expect(recordAccess.getReportRecordAccessClause).not.toHaveBeenCalled();

    database.reviewer.id = 'admin-a';
    database.reviewer.profileName = 'Admin';
    database.reviewer.isAdmin = true;
    expect((await getApprovals()).status).toBe(200);
  });

  it('moves a MIS-approved packet to Finance and assigns its lead through CRM round robin', async () => {
    const misReviewerUserId = 'mis-profile-user';
    database.reviewer.id = misReviewerUserId;
    database.reviewer.profileName = 'MIS Quotation Reviewer';
    recordAccess.getReportRecordAccessClause.mockResolvedValue({ ownerId: 'another-user' });
    const response = await requestReview('receipt-a', { decision: 'APPROVE', note: 'Details verified' });
    expect(response.status).toBe(200);
    expect(database.receiptFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'receipt-a', tenantId: 'tenant-a' },
    }));
    expect(recordAccess.getReportRecordAccessClause).not.toHaveBeenCalled();
    expect(database.receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'receipt-a', tenantId: 'tenant-a', approvalStatus: 'PENDING_APPROVAL', approvalStage: 'MIS' },
      data: expect.objectContaining({
        approvalStatus: 'PENDING_APPROVAL',
        approvalStage: 'FINANCE',
        misApprovalStatus: 'APPROVED',
        financeApprovalStatus: 'PENDING_APPROVAL',
        misApprovalNote: 'Details verified',
      }),
    }));
    const { assignLeadToProjectRoundRobinInTransaction } = await import('../services/rrQueue');
    expect(assignLeadToProjectRoundRobinInTransaction).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        tenantId: 'tenant-a',
        leadId: 'lead-a',
        projectId: 'project-a',
        userType: 'CRM',
        actorId: misReviewerUserId,
        leadStatus: 'BOOKED',
      }),
    );
    expect(database.bookingUpdateMany).toHaveBeenCalledWith({
      where: { id: 'booking-a', tenantId: 'tenant-a', status: 'RESERVED' },
      data: { status: 'BOOKED', ownerId: 'crm-a' },
    });
    expect(database.moveLeadToBookedBucket).toHaveBeenCalledWith(
      'lead-a',
      'booking',
      expect.any(Object),
      misReviewerUserId,
    );
  });

  it('serves the complete receipt list to Finance-profile users and administrators', async () => {
    database.reviewer.profileName = 'Finance Team';
    database.reviewer.id = 'other-finance-user';
    database.receiptFindMany.mockResolvedValue([{ id: 'receipt-a', approvalStage: 'FINANCE' }]);
    const response = await getFinanceApprovals();
    expect(response.status).toBe(200);
    expect(database.receiptFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a' },
      include: expect.objectContaining({ lead: expect.any(Object), booking: expect.any(Object) }),
    }));

    database.reviewer.id = 'sales-a';
    database.reviewer.profileName = 'Sales';
    expect((await getFinanceApprovals()).status).toBe(403);

    database.reviewer.id = 'admin-a';
    database.reviewer.profileName = 'Admin';
    database.reviewer.isAdmin = true;
    expect((await getFinanceApprovals()).status).toBe(200);
  });

  it('deducts a Finance-approved receipt from the Lead once without changing Booking Amount', async () => {
    authenticateAsFinanceReviewer();
    database.receiptFindFirst.mockResolvedValue({
      id: 'receipt-a',
      receiptNumber: 'RC-2026-000001',
      leadId: 'lead-a',
      amount: 25000,
      approvalStatus: 'PENDING_APPROVAL',
      approvalStage: 'FINANCE',
      booking: { quotation: { totalPrice: 100000 } },
    });

    const response = await reviewFinanceReceipt('receipt-a', { decision: 'APPROVE', note: 'Verified' });
    expect(response.status).toBe(200);
    expect(database.leadLandAmountUpdateMany).toHaveBeenCalledWith({
      where: { id: 'lead-a', tenantId: 'tenant-a', totalLandAmount: 75000 },
      data: { totalLandAmount: 50000 },
    });
    expect(database.receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'receipt-a',
        tenantId: 'tenant-a',
        approvalStatus: 'PENDING_APPROVAL',
        approvalStage: 'FINANCE',
      },
      data: expect.objectContaining({
        approvalStatus: 'APPROVED',
        approvalStage: 'COMPLETED',
        financeApprovalStatus: 'APPROVED',
        financeApprovalNote: 'Verified',
      }),
    }));
    expect(database.bookingUpdateMany).not.toHaveBeenCalled();
  });

  it('initializes an unset Lead Total Land Amount from the quotation and deducts the approved receipt', async () => {
    authenticateAsFinanceReviewer();
    database.leadLandAmountFind.mockResolvedValue({ id: 'lead-a', totalLandAmount: null });
    database.receiptFindFirst.mockResolvedValue({
      id: 'receipt-a',
      receiptNumber: 'RC-2026-000001',
      leadId: 'lead-a',
      amount: 25000,
      approvalStatus: 'PENDING_APPROVAL',
      approvalStage: 'FINANCE',
      booking: { quotation: { totalPrice: 100000 } },
    });

    const response = await reviewFinanceReceipt('receipt-a', { decision: 'APPROVE' });

    expect(response.status).toBe(200);
    expect(database.leadLandAmountUpdateMany).toHaveBeenCalledWith({
      where: { id: 'lead-a', tenantId: 'tenant-a', totalLandAmount: null },
      data: { totalLandAmount: 75000 },
    });
    expect(database.receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvalStatus: 'APPROVED' }),
    }));
  });

  it('does not approve when both the Lead Total Land Amount and quotation total are missing', async () => {
    authenticateAsFinanceReviewer();
    database.leadLandAmountFind.mockResolvedValue({ id: 'lead-a', totalLandAmount: null });
    database.receiptFindFirst.mockResolvedValue({
      id: 'receipt-a',
      leadId: 'lead-a',
      amount: 25000,
      approvalStatus: 'PENDING_APPROVAL',
      approvalStage: 'FINANCE',
      booking: { quotation: null },
    });

    const response = await reviewFinanceReceipt('receipt-a', { decision: 'APPROVE' });

    expect(response.status).toBe(409);
    expect(database.leadLandAmountUpdateMany).not.toHaveBeenCalled();
    expect(database.receiptUpdateMany).not.toHaveBeenCalled();
  });

  it('does not deduct the Lead amount for a Finance rejection', async () => {
    authenticateAsFinanceReviewer();
    database.receiptFindFirst.mockResolvedValue({
      id: 'receipt-a',
      receiptNumber: 'RC-2026-000001',
      leadId: 'lead-a',
      amount: 25000,
      approvalStatus: 'PENDING_APPROVAL',
      approvalStage: 'FINANCE',
    });

    const response = await reviewFinanceReceipt('receipt-a', { decision: 'REJECT' });
    expect(response.status).toBe(200);
    expect(database.leadLandAmountUpdateMany).not.toHaveBeenCalled();
    expect(database.receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        approvalStatus: 'REJECTED',
        approvalStage: 'COMPLETED',
        financeApprovalStatus: 'REJECTED',
      }),
    }));
  });

  it('prevents a repeated Finance approval from deducting the Lead amount again', async () => {
    authenticateAsFinanceReviewer();
    database.receiptFindFirst.mockResolvedValue({
      id: 'receipt-a',
      leadId: 'lead-a',
      amount: 25000,
      approvalStatus: 'APPROVED',
      approvalStage: 'COMPLETED',
    });

    const response = await reviewFinanceReceipt('receipt-a', { decision: 'APPROVE' });
    expect(response.status).toBe(409);
    expect(database.leadLandAmountUpdateMany).not.toHaveBeenCalled();
    expect(database.receiptUpdateMany).not.toHaveBeenCalled();
  });

  it('does not approve when the receipt amount exceeds Total Land Amount', async () => {
    authenticateAsFinanceReviewer();
    database.leadLandAmountFind.mockResolvedValue({ id: 'lead-a', totalLandAmount: 10000 });
    database.receiptFindFirst.mockResolvedValue({
      id: 'receipt-a',
      leadId: 'lead-a',
      amount: 25000,
      approvalStatus: 'PENDING_APPROVAL',
      approvalStage: 'FINANCE',
    });

    const response = await reviewFinanceReceipt('receipt-a', { decision: 'APPROVE' });
    expect(response.status).toBe(409);
    expect(database.leadLandAmountUpdateMany).not.toHaveBeenCalled();
    expect(database.receiptUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects a packet in MIS and releases its reserved unit without CRM assignment', async () => {
    const response = await requestReview('receipt-a', { decision: 'REJECT', note: 'Payment details do not match' });
    expect(response.status).toBe(200);
    expect(database.receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvalStatus: 'REJECTED' }),
    }));
    expect(database.bookingUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'CANCELLED', bookingStage: 'CANCELLED' },
    }));
    expect(database.unitUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'unit-a', tenantId: 'tenant-a', status: 'RESERVED' },
      data: { status: 'AVAILABLE' },
    }));
    const { assignLeadToProjectRoundRobinInTransaction } = await import('../services/rrQueue');
    expect(assignLeadToProjectRoundRobinInTransaction).not.toHaveBeenCalled();
  });
});

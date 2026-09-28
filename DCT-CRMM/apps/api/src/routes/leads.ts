import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { leadSchema, normalizePhone, PHONE_DUPLICATE_ERROR } from '@dct-crm/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { canTransitionStatus, getAllowedStatuses, isValidStatus } from '../services/workflow';
import { getNextSVCUser, getNextSalesUser, getNextPresalesUser } from '../services/roundRobin';
import { createOwnerHistory, getOwnerHistory } from '../services/ownerHistory';

const router = Router();

router.use(authenticate);

async function getNextLeadNumber(tenantId: string): Promise<string> {
  const sequence = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequence.upsert({
      where: { tenantId_type: { tenantId, type: 'LEAD' } },
      update: { nextValue: { increment: 1 } },
      create: { tenantId, type: 'LEAD', nextValue: 1 },
    });
    return seq;
  });
  return `LN${String(sequence.nextValue).padStart(6, '0')}`;
}

async function findPhoneConflict(
  tenantId: string,
  phone: string,
  excludeLeadId?: string,
): Promise<boolean> {
  const normalized = normalizePhone(phone);
  const candidates = await prisma.lead.findMany({
    where: {
      tenantId,
      phone: { not: null },
      ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
    },
    select: { id: true, phone: true },
  });
  return candidates.some(
    (lead) => lead.phone != null && normalizePhone(lead.phone) === normalized,
  );
}

function isPhoneUniqueViolation(error: any): boolean {
  if (error?.code !== 'P2002') return false;
  const target = error?.meta?.target;
  if (Array.isArray(target)) return target.includes('phone');
  if (typeof target === 'string') return target.includes('phone');
  return false;
}

const LEAD_DIFFABLE_FIELDS = [
  'firstName', 'lastName', 'salutation', 'title', 'email', 'phone', 'mobile',
  'website', 'company', 'industry', 'annualRevenue', 'numberOfEmployees',
  'source', 'status', 'rating', 'description', 'street', 'city',
  'stateProvince', 'country', 'postalCode', 'score', 'budget',
  'requirements', 'notes', 'ownerId', 'projectId',
] as const;

function normalizeDiffValue(value: any): any {
  if (value === undefined) return null;
  if (value === '') return null;
  return value;
}

function computeLeadDiff(
  existing: Record<string, any>,
  incoming: Record<string, any>,
): { oldValues: Record<string, any>; newValues: Record<string, any>; updateData: Record<string, any> } {
  const oldValues: Record<string, any> = {};
  const newValues: Record<string, any> = {};
  const updateData: Record<string, any> = {};

  for (const field of LEAD_DIFFABLE_FIELDS) {
    if (!(field in incoming)) continue;
    const incomingValue = normalizeDiffValue((incoming as Record<string, any>)[field]);
    const existingValue = normalizeDiffValue(existing[field]);
    if (incomingValue === existingValue) continue;
    oldValues[field] = existingValue;
    newValues[field] = incomingValue;
    updateData[field] = (incoming as Record<string, any>)[field] === '' ? null : (incoming as Record<string, any>)[field];
  }

  return { oldValues, newValues, updateData };
}

router.get('/', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, source, ownerId, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (!req.user!.isSuperAdmin) {
      where.tenantId = req.tenantId!;
    }
    if (status && status !== 'All Statuses') where.status = status;
    if (source) where.source = source;
    if (ownerId) where.ownerId = ownerId;
    if (search) {
      const searchTerm = search as string;
      const words = searchTerm.trim().split(/\s+/).filter(Boolean);
      const matchWord = (word: string) => [
        { leadNumber: { contains: word, mode: 'insensitive' as const } },
        { firstName: { contains: word, mode: 'insensitive' as const } },
        { lastName: { contains: word, mode: 'insensitive' as const } },
        { email: { contains: word, mode: 'insensitive' as const } },
        { phone: { contains: word } },
        { company: { contains: word, mode: 'insensitive' as const } },
        { title: { contains: word, mode: 'insensitive' as const } },
      ];
      if (words.length > 1) {
        where.AND = words.map((word) => ({ OR: matchWord(word) }));
      } else {
        where.OR = matchWord(searchTerm);
      }
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      const allowedStatuses = getAllowedStatuses(profileName);
      if (allowedStatuses.length > 0) {
        where.status = { in: allowedStatuses };
      }
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
          _count: { select: { siteVisits: true, opportunities: true, activities: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leads' });
  }
});

router.get('/:id', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
        siteVisits: {
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true } },
            project: { select: { id: true, name: true } },
          },
          orderBy: { scheduledAt: 'desc' },
        },
        opportunities: {
          include: { owner: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        activities: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        followUps: {
          orderBy: { dueDate: 'asc' },
          take: 10,
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const ownerHistory = await getOwnerHistory(req.tenantId!, req.params.id);

    const lastAudit = await prisma.auditLog.findFirst({
      where: {
        tenantId: req.tenantId!,
        OR: [{ leadId: lead.id }, { objectType: 'Lead', objectId: lead.id }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const lastModified = lastAudit
      ? {
          by: lastAudit.user,
          at: lastAudit.createdAt,
          action: lastAudit.action,
        }
      : {
          by: lead.creator
            ? { id: lead.creator.id, firstName: lead.creator.firstName, lastName: lead.creator.lastName, email: null }
            : null,
          at: lead.updatedAt,
          action: 'CREATE',
        };

    res.json({ success: true, data: { ...lead, ownerHistory, lastModified } });
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead' });
  }
});

router.post('/', authorize('Lead', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = leadSchema.parse(req.body);

    if (await findPhoneConflict(req.tenantId!, data.phone)) {
      return res.status(409).json({ success: false, error: PHONE_DUPLICATE_ERROR });
    }

    const leadNumber = await getNextLeadNumber(req.tenantId!);

    let ownerId = data.ownerId || req.user!.id;
    if (!data.ownerId) {
      try {
        const presalesUser = await getNextPresalesUser(req.tenantId!);
        if (presalesUser) {
          ownerId = presalesUser.id;
        }
      } catch (error) {
        console.error('Failed to assign default presales owner:', error);
      }
    }

    const lead = await prisma.lead.create({
      data: {
        tenantId: req.tenantId!,
        creatorId: req.user!.id,
        leadNumber,
        firstName: data.firstName || undefined,
        lastName: data.lastName,
        salutation: data.salutation || undefined,
        title: data.title || undefined,
        email: data.email || undefined,
        phone: normalizePhone(data.phone),
        mobile: data.mobile || undefined,
        website: data.website || undefined,
        company: data.company,
        industry: data.industry || undefined,
        annualRevenue: data.annualRevenue || undefined,
        numberOfEmployees: data.numberOfEmployees || undefined,
        source: data.source,
        status: 'NEW',
        rating: data.rating || undefined,
        description: data.description || undefined,
        street: data.street || undefined,
        city: data.city || undefined,
        stateProvince: data.stateProvince || undefined,
        country: data.country || undefined,
        postalCode: data.postalCode || undefined,
        score: data.score || 0,
        budget: data.budget || undefined,
        ownerId,
        projectId: data.projectId || undefined,
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
      },
    });

    await createOwnerHistory({
      tenantId: req.tenantId!,
      leadId: lead.id,
      previousOwnerId: null,
      newOwnerId: ownerId,
      previousProfile: null,
      newProfile: req.user!.profileName || null,
      previousStatus: null,
      newStatus: 'NEW',
      handoffReason: 'Lead Created',
      changedById: req.user!.id,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: lead.id,
        action: 'CREATE',
        objectType: 'Lead',
        objectId: lead.id,
        newValues: data,
      },
    });

    res.status(201).json({ success: true, data: lead });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (isPhoneUniqueViolation(error)) {
      return res.status(409).json({ success: false, error: PHONE_DUPLICATE_ERROR });
    }
    console.error('Create lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to create lead' });
  }
});

router.put('/:id', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingLead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingLead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const bodyData = { ...req.body };
    delete bodyData.leadNumber;
    const reason =
      typeof bodyData.reason === 'string' && bodyData.reason.trim()
        ? bodyData.reason.trim()
        : undefined;
    delete bodyData.reason;
    const data = leadSchema.partial().parse(bodyData);

    if (data.status && !isValidStatus(data.status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${data.status}` });
    }

    if (data.phone !== undefined && data.phone !== '') {
      const phoneToCheck = normalizePhone(data.phone);
      if (await findPhoneConflict(req.tenantId!, phoneToCheck, req.params.id)) {
        return res.status(409).json({ success: false, error: PHONE_DUPLICATE_ERROR });
      }
      data.phone = phoneToCheck;
    }

    if (data.status) {
      const profileName = req.user!.profileName || 'Admin';

      if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
        if (!canTransitionStatus(profileName, existingLead.status, data.status)) {
          return res.status(403).json({
            success: false,
            error: `Profile ${profileName} cannot change status from ${existingLead.status} to ${data.status}`,
          });
        }
      }
    }

    const { oldValues, newValues, updateData } = computeLeadDiff(existingLead, data);

    if (Object.keys(updateData).length === 0) {
      const unchanged = await prisma.lead.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      });
      return res.json({ success: true, data: unchanged, unchanged: true });
    }

    const ownerChanged =
      'ownerId' in updateData &&
      normalizeDiffValue(updateData.ownerId) !== normalizeDiffValue(existingLead.ownerId);

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      });

      const auditNewValues = reason ? { ...newValues, reason } : newValues;

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: lead.id,
          action: ownerChanged && Object.keys(newValues).length === 1 ? 'OWNER_CHANGED' : 'UPDATE',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues,
          newValues: auditNewValues,
        },
      });

      if (ownerChanged) {
        const newOwnerId = normalizeDiffValue(updateData.ownerId);
        const newOwner = newOwnerId
          ? await tx.user.findUnique({
              where: { id: newOwnerId },
              select: { id: true, firstName: true, lastName: true, profile: { select: { name: true } } },
            })
          : null;

        await createOwnerHistory({
          tenantId: req.tenantId!,
          leadId: lead.id,
          previousOwnerId: existingLead.ownerId,
          newOwnerId: newOwnerId as string | null,
          previousProfile: null,
          newProfile: newOwner?.profile?.name || null,
          previousStatus: existingLead.status,
          newStatus: lead.status,
          handoffReason: reason || 'Owner changed via lead update',
          changedById: req.user!.id,
        });
      }

      return lead;
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (isPhoneUniqueViolation(error)) {
      return res.status(409).json({ success: false, error: PHONE_DUPLICATE_ERROR });
    }
    console.error('Update lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead' });
  }
});

router.delete('/:id', authorize('Lead', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    await prisma.lead.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: lead.id,
        action: 'DELETE',
        objectType: 'Lead',
        objectId: lead.id,
        oldValues: lead,
      },
    });

    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete lead' });
  }
});

router.post('/:id/push-to-svc', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Reason/note is required for status change' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (lead.status !== 'INCOMING') {
      return res.status(400).json({ success: false, error: 'Lead must be in Incoming status to push to SVC' });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, 'INCOMING', 'PROSPECT')) {
        return res.status(403).json({ success: false, error: 'Not authorized to push leads to SVC' });
      }
    }

    const svcUser = await getNextSVCUser(req.tenantId!);
    if (!svcUser) {
      return res.status(400).json({ success: false, error: 'No active SVC Round Robin members configured' });
    }

    const previousOwner = lead.owner;
    const previousProfile = profileName;

    const svcUserProfile = await prisma.user.findUnique({
      where: { id: svcUser.id },
      select: { profile: { select: { name: true } } },
    });

    const result = await prisma.$transaction(async (tx) => {
      const updatedLead = await tx.lead.update({
        where: { id: req.params.id },
        data: {
          status: 'PROSPECT',
          ownerId: svcUser.id,
        },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await createOwnerHistory({
        tenantId: req.tenantId!,
        leadId: lead.id,
        previousOwnerId: lead.ownerId,
        newOwnerId: svcUser.id,
        previousProfile,
        newProfile: svcUserProfile?.profile?.name || null,
        previousStatus: 'INCOMING',
        newStatus: 'PROSPECT',
        handoffReason: reason,
        changedById: req.user!.id,
      });

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: lead.id,
          action: 'PUSH_TO_SVC',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: 'INCOMING', ownerId: lead.ownerId, ownerName: previousOwner ? `${previousOwner.firstName} ${previousOwner.lastName}` : null },
          newValues: { status: 'PROSPECT', ownerId: svcUser.id, ownerName: `${svcUser.firstName} ${svcUser.lastName}`, note: reason, reason },
        },
      });

      if (lead.ownerId !== svcUser.id) {
        await tx.auditLog.create({
          data: {
            tenantId: req.tenantId!,
            userId: req.user!.id,
            leadId: lead.id,
            action: 'OWNER_CHANGED',
            objectType: 'Lead',
            objectId: lead.id,
            oldValues: { ownerId: lead.ownerId, ownerName: previousOwner ? `${previousOwner.firstName} ${previousOwner.lastName}` : null },
            newValues: { ownerId: svcUser.id, ownerName: `${svcUser.firstName} ${svcUser.lastName}`, reason },
          },
        });
      }

      await tx.notification.create({
        data: {
          tenantId: req.tenantId!,
          userId: svcUser.id,
          title: 'Lead Assigned to SVC',
          message: `Lead ${lead.leadNumber} ${lead.firstName ? lead.firstName + ' ' : ''}${lead.lastName} has been assigned to you for site visit coordination.`,
          type: 'LEAD_ASSIGNMENT',
          referenceId: lead.id,
          referenceType: 'Lead',
        },
      });

      return updatedLead;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Push to SVC error:', error);
    res.status(500).json({ success: false, error: 'Failed to push lead to SVC' });
  }
});

router.post('/:id/move-to-recovery', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { recoveryReason, note } = req.body;
    if (!recoveryReason || !recoveryReason.trim()) {
      return res.status(400).json({ success: false, error: 'Recovery reason is required' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (lead.status !== 'INCOMING' && lead.status !== 'NEW') {
      return res.status(400).json({ success: false, error: 'Lead must be in New or Incoming status to move to recovery' });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, lead.status, 'LOST')) {
        return res.status(403).json({ success: false, error: 'Not authorized to move this lead to recovery' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedLead = await tx.lead.update({
        where: { id: req.params.id },
        data: { status: 'LOST' },
        include: { owner: { select: { id: true, firstName: true, lastName: true } } },
      });

      await createOwnerHistory({
        tenantId: req.tenantId!,
        leadId: lead.id,
        previousOwnerId: lead.ownerId,
        newOwnerId: null,
        previousProfile: profileName,
        newProfile: 'Recovery',
        previousStatus: lead.status,
        newStatus: 'LOST',
        handoffReason: recoveryReason,
        changedById: req.user!.id,
      });

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: lead.id,
          action: 'MOVE_TO_RECOVERY',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: lead.status, ownerId: lead.ownerId },
          newValues: { status: 'LOST', recoveryReason, recoveryNote: note, reason: recoveryReason },
        },
      });

      return updatedLead;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Move to recovery error:', error);
    res.status(500).json({ success: false, error: 'Failed to move lead to recovery' });
  }
});

router.post('/:id/schedule-site-visit', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { scheduledAt, notes, projectId } = req.body;

    if (!projectId || !projectId.trim()) {
      return res.status(400).json({ success: false, error: 'Project is required for site visit' });
    }
    if (!notes || !notes.trim()) {
      return res.status(400).json({ success: false, error: 'Note/reason is required for site visit' });
    }
    if (!scheduledAt) {
      return res.status(400).json({ success: false, error: 'Visit date/time is required' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (lead.status !== 'PROSPECT') {
      return res.status(400).json({ success: false, error: 'Lead must be in Prospect status to schedule site visit' });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, 'PROSPECT', 'SITE_VISIT_SCHEDULED')) {
        return res.status(403).json({ success: false, error: 'Not authorized to schedule site visits' });
      }
    }

    const salesUser = await getNextSalesUser(req.tenantId!);
    if (!salesUser) {
      return res.status(400).json({ success: false, error: 'No active Sales Round Robin members configured' });
    }

    const previousOwner = lead.owner;
    const salesUserProfile = await prisma.user.findUnique({
      where: { id: salesUser.id },
      select: { profile: { select: { name: true } } },
    });

    const result = await prisma.$transaction(async (tx) => {
      const siteVisit = await tx.siteVisit.create({
        data: {
          tenantId: req.tenantId!,
          leadId: lead.id,
          projectId: projectId || undefined,
          assigneeId: salesUser.id,
          creatorId: req.user!.id,
          scheduledAt: new Date(scheduledAt),
          status: 'SCHEDULED',
          notes,
        },
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id: req.params.id },
        data: {
          status: 'SITE_VISIT_SCHEDULED',
          ownerId: salesUser.id,
        },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await createOwnerHistory({
        tenantId: req.tenantId!,
        leadId: lead.id,
        previousOwnerId: lead.ownerId,
        newOwnerId: salesUser.id,
        previousProfile: profileName,
        newProfile: salesUserProfile?.profile?.name || null,
        previousStatus: 'PROSPECT',
        newStatus: 'SITE_VISIT_SCHEDULED',
        handoffReason: notes,
        changedById: req.user!.id,
      });

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: lead.id,
          action: 'SITE_VISIT_SCHEDULED',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: 'PROSPECT', ownerId: lead.ownerId, ownerName: previousOwner ? `${previousOwner.firstName} ${previousOwner.lastName}` : null },
          newValues: { status: 'SITE_VISIT_SCHEDULED', ownerId: salesUser.id, ownerName: `${salesUser.firstName} ${salesUser.lastName}`, siteVisitId: siteVisit.id, note: notes, reason: notes },
        },
      });

      if (lead.ownerId !== salesUser.id) {
        await tx.auditLog.create({
          data: {
            tenantId: req.tenantId!,
            userId: req.user!.id,
            leadId: lead.id,
            action: 'OWNER_CHANGED',
            objectType: 'Lead',
            objectId: lead.id,
            oldValues: { ownerId: lead.ownerId, ownerName: previousOwner ? `${previousOwner.firstName} ${previousOwner.lastName}` : null },
            newValues: { ownerId: salesUser.id, ownerName: `${salesUser.firstName} ${salesUser.lastName}`, reason: notes },
          },
        });
      }

      await tx.notification.create({
        data: {
          tenantId: req.tenantId!,
          userId: salesUser.id,
          title: 'Site Visit Scheduled',
          message: `A site visit has been scheduled for lead ${lead.leadNumber} ${lead.firstName ? lead.firstName + ' ' : ''}${lead.lastName}. You are the assigned sales executive.`,
          type: 'SITE_VISIT_ASSIGNED',
          referenceId: lead.id,
          referenceType: 'Lead',
        },
      });

      return { lead: updatedLead, siteVisit };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Schedule site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to schedule site visit' });
  }
});

router.put('/:id/status', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, note } = req.body;

    if (!isValidStatus(status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${status}` });
    }

    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, error: 'A note/reason is required for status change' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (lead.status === status) {
      return res.status(400).json({ success: false, error: `Lead is already in ${status} status` });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, lead.status, status)) {
        return res.status(403).json({
          success: false,
          error: `Profile ${profileName} cannot change status from ${lead.status} to ${status}`,
        });
      }
    }

    const updatedLead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { status },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: lead.id,
        action: 'STATUS_CHANGE',
        objectType: 'Lead',
        objectId: lead.id,
        oldValues: { status: lead.status },
        newValues: { status, note, reason: note },
      },
    });

    res.json({ success: true, data: updatedLead });
  } catch (error) {
    console.error('Update lead status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead status' });
  }
});

router.put('/:id/assign', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { ownerId } = req.body;
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (ownerId) {
      const targetUser = await prisma.user.findFirst({
        where: { id: ownerId, tenantId: req.tenantId!, isActive: true },
        select: { id: true, tenantId: true },
      });
      if (!targetUser || targetUser.tenantId !== req.tenantId) {
        return res.status(400).json({ success: false, error: 'Cannot assign lead to a user from another company' });
      }
    }

    const newOwner = ownerId ? await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, firstName: true, lastName: true },
    }) : null;

    const updatedLead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { ownerId },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createOwnerHistory({
      tenantId: req.tenantId!,
      leadId: lead.id,
      previousOwnerId: lead.ownerId,
      newOwnerId: ownerId || null,
      previousProfile: req.user!.profileName || null,
      newProfile: null,
      previousStatus: lead.status,
      newStatus: lead.status,
      handoffReason: req.body.reason || 'Manual Assignment',
      changedById: req.user!.id,
    });

    const assignReason =
      typeof req.body.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : 'Manual Assignment';

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: lead.id,
        action: 'OWNER_CHANGED',
        objectType: 'Lead',
        objectId: lead.id,
        oldValues: { ownerId: lead.ownerId, ownerName: lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : null },
        newValues: { ownerId, ownerName: newOwner ? `${newOwner.firstName} ${newOwner.lastName}` : null, reason: assignReason },
      },
    });

    res.json({ success: true, data: updatedLead });
  } catch (error) {
    console.error('Assign lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign lead' });
  }
});

router.get('/:id/owner-history', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const history = await getOwnerHistory(req.tenantId!, req.params.id);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get owner history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch owner history' });
  }
});

router.get('/:id/audit-history', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, action } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      select: { id: true },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const where: any = {
      tenantId: req.tenantId!,
      OR: [{ leadId: lead.id }, { objectType: 'Lead', objectId: lead.id }],
    };
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get lead audit history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead audit history' });
  }
});

export { router as leadRoutes };

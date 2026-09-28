import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';

const router = Router();

router.use(authenticate);

const siteVisitSchema = z.object({
  leadId: z.string().min(1, 'Lead ID is required'),
  projectId: z.string().min(1, 'Project is required'),
  assigneeId: z.string().optional(),
  queueId: z.string().optional(),
  scheduledAt: z.string().datetime(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED']).optional(),
  notes: z.string().min(1, 'Note/reason is required').max(2000),
  feedback: z.string().max(1000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

const updateSiteVisitSchema = siteVisitSchema.partial();

router.get('/', authorize('SiteVisit', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const {
      page = 1,
      limit = 20,
      leadId,
      projectId,
      assigneeId,
      status,
      startDate,
      endDate,
      sortBy = 'scheduledAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { tenantId };
    if (leadId) where.leadId = leadId;
    if (projectId) where.projectId = projectId;
    if (assigneeId) where.assigneeId = assigneeId;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.scheduledAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    const [siteVisits, total] = await Promise.all([
      prisma.siteVisit.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          creator: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.siteVisit.count({ where }),
    ]);

    res.json({
      success: true,
      data: siteVisits,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get site visits error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch site visits' });
  }
});

router.get('/:id', authorize('SiteVisit', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;

    const siteVisit = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        activities: { take: 10, orderBy: { createdAt: 'desc' } },
        tasks: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!siteVisit) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }

    res.json({ success: true, data: siteVisit });
  } catch (error) {
    console.error('Get site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch site visit' });
  }
});

router.post('/', authorize('SiteVisit', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = siteVisitSchema.parse(req.body);

    const siteVisit = await prisma.siteVisit.create({
      data: {
        tenantId,
        leadId: data.leadId,
        projectId: data.projectId,
        assigneeId: data.assigneeId,
        creatorId: userId,
        queueId: data.queueId,
        scheduledAt: new Date(data.scheduledAt),
        status: data.status || 'SCHEDULED',
        notes: data.notes,
        feedback: data.feedback,
        rating: data.rating,
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
      },
    });

    await auditLog(tenantId, userId, 'CREATE', 'SiteVisit', siteVisit.id, null, { leadId: data.leadId, scheduledAt: data.scheduledAt });

    res.status(201).json({ success: true, data: siteVisit });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to create site visit' });
  }
});

router.put('/:id', authorize('SiteVisit', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }

    const data = updateSiteVisitSchema.parse(req.body);

    const updateData: any = { ...data };
    if (data.scheduledAt) updateData.scheduledAt = new Date(data.scheduledAt);

    const siteVisit = await prisma.siteVisit.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await auditLog(tenantId, userId, 'UPDATE', 'SiteVisit', siteVisit.id, existing, siteVisit);

    res.json({ success: true, data: siteVisit });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to update site visit' });
  }
});

router.patch('/:id/complete', authorize('SiteVisit', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { feedback, rating, notes } = req.body;

    const existing = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
      include: { lead: { select: { id: true, status: true } } },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const siteVisit = await tx.siteVisit.update({
        where: { id: req.params.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          feedback,
          rating,
          notes,
        },
      });

      if (existing.lead && existing.lead.status === 'SITE_VISIT_SCHEDULED') {
        await tx.lead.update({
          where: { id: existing.leadId },
          data: { status: 'SITE_VISIT_HAPPENED' },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            leadId: existing.leadId,
            action: 'SITE_VISIT_HAPPENED',
            objectType: 'Lead',
            objectId: existing.leadId,
            oldValues: { status: 'SITE_VISIT_SCHEDULED' },
            newValues: { status: 'SITE_VISIT_HAPPENED', siteVisitId: existing.id, reason: notes || 'Site visit completed' },
          },
        });
      }

      await auditLog(tenantId, userId, 'UPDATE', 'SiteVisit', siteVisit.id, existing, { status: 'COMPLETED', feedback, rating });

      return siteVisit;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Complete site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete site visit' });
  }
});

router.delete('/:id', authorize('SiteVisit', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }

    await prisma.siteVisit.delete({ where: { id: req.params.id } });

    await auditLog(tenantId, userId, 'DELETE', 'SiteVisit', existing.id, existing, null);

    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Delete site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete site visit' });
  }
});

export default router;

import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';

const router = Router();

router.use(authenticate);

const workflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.string().min(1),
  triggerObject: z.string().min(1),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'in', 'not_in']),
    value: z.any(),
  })),
  actions: z.array(z.object({
    type: z.enum(['update_field', 'send_notification', 'create_task', 'send_email', 'assign_owner', 'update_status']),
    config: z.record(z.any()),
  })),
  isActive: z.boolean().optional(),
});

const updateWorkflowSchema = workflowSchema.partial();

router.get('/', authorize('Workflow', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, triggerType, triggerObject, isActive, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { tenantId: req.tenantId! };
    if (triggerType) where.triggerType = triggerType;
    if (triggerObject) where.triggerObject = triggerObject;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.workflow.count({ where }),
    ]);

    res.json({
      success: true,
      data: workflows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get workflows error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch workflows' });
  }
});

router.get('/:id', authorize('Workflow', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    res.json({ success: true, data: workflow });
  } catch (error) {
    console.error('Get workflow error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch workflow' });
  }
});

router.post('/', authorize('Workflow', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = workflowSchema.parse(req.body);

    const existingWorkflow = await prisma.workflow.findFirst({
      where: { tenantId: req.tenantId!, name: data.name },
    });

    if (existingWorkflow) {
      return res.status(409).json({ success: false, error: 'Workflow with this name already exists' });
    }

    const workflow = await prisma.workflow.create({
      data: {
        tenantId: req.tenantId!,
        name: data.name,
        description: data.description,
        triggerType: data.triggerType,
        triggerObject: data.triggerObject,
        conditions: data.conditions,
        actions: data.actions,
        isActive: data.isActive ?? true,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'CREATE',
        objectType: 'Workflow',
        objectId: workflow.id,
        newValues: { name: data.name, triggerType: data.triggerType },
      },
    });

    res.status(201).json({ success: true, data: workflow });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create workflow error:', error);
    res.status(500).json({ success: false, error: 'Failed to create workflow' });
  }
});

router.put('/:id', authorize('Workflow', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingWorkflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingWorkflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    const data = updateWorkflowSchema.parse(req.body);

    if (data.name && data.name !== existingWorkflow.name) {
      const duplicateWorkflow = await prisma.workflow.findFirst({
        where: { tenantId: req.tenantId!, name: data.name, id: { not: req.params.id } },
      });

      if (duplicateWorkflow) {
        return res.status(409).json({ success: false, error: 'Workflow with this name already exists' });
      }
    }

    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'UPDATE',
        objectType: 'Workflow',
        objectId: workflow.id,
        oldValues: existingWorkflow,
        newValues: data,
      },
    });

    res.json({ success: true, data: workflow });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update workflow error:', error);
    res.status(500).json({ success: false, error: 'Failed to update workflow' });
  }
});

router.delete('/:id', authorize('Workflow', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    await prisma.workflow.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'Workflow',
        objectId: req.params.id,
        oldValues: workflow,
      },
    });

    res.json({ success: true, message: 'Workflow deleted successfully' });
  } catch (error) {
    console.error('Delete workflow error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete workflow' });
  }
});

router.put('/:id/toggle', authorize('Workflow', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    const updatedWorkflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: { isActive: !workflow.isActive },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'STATUS_CHANGE',
        objectType: 'Workflow',
        objectId: workflow.id,
        oldValues: { isActive: workflow.isActive },
        newValues: { isActive: !workflow.isActive },
      },
    });

    res.json({ success: true, data: updatedWorkflow });
  } catch (error) {
    console.error('Toggle workflow error:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle workflow' });
  }
});

router.post('/:id/test', authorize('Workflow', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    const conditions = workflow.conditions as any[];
    const actions = workflow.actions as any[];

    const testResult = {
      workflow: workflow.name,
      triggerType: workflow.triggerType,
      triggerObject: workflow.triggerObject,
      conditionsCount: conditions.length,
      actionsCount: actions.length,
      conditions: conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
        description: `Check if ${c.field} ${c.operator} ${JSON.stringify(c.value)}`,
      })),
      actions: actions.map((a) => ({
        type: a.type,
        config: a.config,
        description: `Execute ${a.type} with config ${JSON.stringify(a.config)}`,
      })),
      isValid: conditions.length > 0 && actions.length > 0,
    };

    res.json({ success: true, data: testResult });
  } catch (error) {
    console.error('Test workflow error:', error);
    res.status(500).json({ success: false, error: 'Failed to test workflow' });
  }
});

export { router as workflowRoutes };

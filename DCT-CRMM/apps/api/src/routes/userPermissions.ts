import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();
router.use(authenticate);

const addDirectPermissionSchema = z.object({
  permissionIds: z.array(z.string()).min(1, 'At least one permission is required'),
});

router.get('/:userId/direct-permissions', requirePermission('USER_PERMISSION_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.tenantId! },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const directPerms = await prisma.userDirectPermission.findMany({
      where: { userId: req.params.userId },
      include: { permission: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: directPerms });
  } catch (error) {
    console.error('Get direct permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch direct permissions' });
  }
});

router.post('/:userId/direct-permissions', requirePermission('USER_PERMISSION_ADD'), async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.tenantId! },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const data = addDirectPermissionSchema.parse(req.body);

    const uniquePermissionIds = [...new Set(data.permissionIds)];

    const validPermissions = await prisma.permission.findMany({
      where: { id: { in: uniquePermissionIds }, isActive: true },
    });

    if (validPermissions.length !== uniquePermissionIds.length) {
      return res.status(422).json({ success: false, error: 'One or more invalid permission IDs' });
    }

    const existing = await prisma.userDirectPermission.findMany({
      where: { userId: req.params.userId, permissionId: { in: uniquePermissionIds } },
      select: { permissionId: true },
    });

    const existingIds = new Set(existing.map((e) => e.permissionId));
    const newIds = uniquePermissionIds.filter((id) => !existingIds.has(id));

    if (newIds.length === 0) {
      return res.status(409).json({ success: false, error: 'All permissions already assigned' });
    }

    const created = await prisma.userDirectPermission.createMany({
      data: newIds.map((permissionId) => ({ userId: req.params.userId, permissionId })),
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'ADD',
        objectType: 'UserDirectPermission',
        objectId: req.params.userId,
        newValues: { permissionIds: newIds },
      },
    });

    res.status(201).json({ success: true, data: { added: created.count, alreadyAssigned: existingIds.size } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid permission data' });
    }
    console.error('Add direct permission error:', error);
    res.status(500).json({ success: false, error: 'Failed to add direct permission' });
  }
});

router.delete('/:userId/direct-permissions/:permissionId', requirePermission('USER_PERMISSION_REMOVE'), async (req: AuthRequest, res: Response) => {
  try {
    const targetUser = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.tenantId! },
    });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const deleted = await prisma.userDirectPermission.deleteMany({
      where: { userId: req.params.userId, permissionId: req.params.permissionId },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ success: false, error: 'Direct permission not found' });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'REMOVE',
        objectType: 'UserDirectPermission',
        objectId: req.params.userId,
        oldValues: { permissionId: req.params.permissionId },
      },
    });

    res.json({ success: true, message: 'Direct permission removed' });
  } catch (error) {
    console.error('Remove direct permission error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove direct permission' });
  }
});

router.get('/:userId/permission-sets', requirePermission('PERMISSION_SET_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.tenantId! },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const assignments = await prisma.userPermissionAssignment.findMany({
      where: { userId: req.params.userId },
      include: {
        permissionSet: {
          include: { items: { include: { permission: true } } },
        },
      },
    });

    res.json({ success: true, data: assignments });
  } catch (error) {
    console.error('Get user permission sets error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user permission sets' });
  }
});

router.post('/:userId/permission-sets', requirePermission('PERMISSION_SET_ASSIGN'), async (req: AuthRequest, res: Response) => {
  try {
    const { permissionSetIds } = req.body;
    if (!Array.isArray(permissionSetIds) || permissionSetIds.length === 0) {
      return res.status(400).json({ success: false, error: 'permissionSetIds array is required' });
    }

    const uniqueIds = [...new Set(permissionSetIds)];

    const user = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.tenantId! },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const validSets = await prisma.newPermissionSet.findMany({
      where: { id: { in: uniqueIds }, tenantId: req.tenantId!, isActive: true },
      select: { id: true },
    });

    if (validSets.length !== uniqueIds.length) {
      return res.status(422).json({ success: false, error: 'One or more invalid permission set IDs' });
    }

    const existing = await prisma.userPermissionAssignment.findMany({
      where: { userId: req.params.userId, permissionSetId: { in: uniqueIds } },
      select: { permissionSetId: true },
    });

    const existingIds = new Set(existing.map((e) => e.permissionSetId));
    const newIds = uniqueIds.filter((id: string) => !existingIds.has(id));

    if (newIds.length === 0) {
      return res.status(409).json({ success: false, error: 'All permission sets already assigned' });
    }

    const created = await prisma.userPermissionAssignment.createMany({
      data: newIds.map((permissionSetId: string) => ({ userId: req.params.userId, permissionSetId })),
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'ASSIGN',
        objectType: 'UserPermissionAssignment',
        objectId: req.params.userId,
        newValues: { permissionSetIds: newIds },
      },
    });

    res.status(201).json({ success: true, data: { assigned: created.count, alreadyAssigned: existingIds.size } });
  } catch (error) {
    console.error('Assign permission sets to user error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign permission sets' });
  }
});

router.delete('/:userId/permission-sets/:permissionSetId', requirePermission('PERMISSION_SET_ASSIGN'), async (req: AuthRequest, res: Response) => {
  try {
    const targetUser = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.tenantId! },
    });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const deleted = await prisma.userPermissionAssignment.deleteMany({
      where: { userId: req.params.userId, permissionSetId: req.params.permissionSetId },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'UNASSIGN',
        objectType: 'UserPermissionAssignment',
        objectId: req.params.userId,
        oldValues: { permissionSetId: req.params.permissionSetId },
      },
    });

    res.json({ success: true, message: 'Permission set unassigned from user' });
  } catch (error) {
    console.error('Unassign permission set from user error:', error);
    res.status(500).json({ success: false, error: 'Failed to unassign permission set' });
  }
});

export { router as userPermissionRoutes };
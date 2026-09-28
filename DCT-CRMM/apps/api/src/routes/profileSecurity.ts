import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();
router.use(authenticate);

const updateSecuritySchema = z.object({
  objectPermissions: z.array(z.object({
    objectId: z.string(),
    canCreate: z.boolean(),
    canRead: z.boolean(),
    canUpdate: z.boolean(),
    canDelete: z.boolean(),
    viewAll: z.boolean(),
    modifyAll: z.boolean(),
  })).optional(),
  fieldPermissions: z.array(z.object({
    fieldId: z.string(),
    canRead: z.boolean(),
    canEdit: z.boolean(),
  })).optional(),
  recordAccess: z.record(z.enum(['OWN', 'TEAM', 'ALL'])).optional(),
  permissionIds: z.array(z.string()).optional(),
});

router.get('/:profileId/security', requirePermission('PROFILE_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.profile.findFirst({
      where: { id: req.params.profileId, tenantId: req.tenantId! },
      select: { id: true, name: true, description: true, isAdmin: true, leadStatusAccess: true },
    });
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

    const [objects, objectPermissions, fieldPermissions, permissions] = await Promise.all([
      prisma.objectDefinition.findMany({
        where: { tenantId: req.tenantId!, isActive: true },
        select: { id: true, name: true, label: true, fields: { where: { isActive: true }, select: { id: true, name: true, label: true, fieldType: true }, orderBy: { displayOrder: 'asc' } } },
        orderBy: { label: 'asc' },
      }),
      prisma.profileObjectPermission.findMany({ where: { profileId: req.params.profileId } }),
      prisma.profileFieldPermission.findMany({ where: { profileId: req.params.profileId } }),
      prisma.userProfilePermission.findMany({ where: { profileId: req.params.profileId }, include: { permission: true } }),
    ]);

    const storedAccess = profile.leadStatusAccess && typeof profile.leadStatusAccess === 'object' && !Array.isArray(profile.leadStatusAccess)
      ? profile.leadStatusAccess as Record<string, any>
      : {};
    res.json({ success: true, data: { profile, objects, objectPermissions, fieldPermissions, permissions: permissions.map((item) => item.permission), recordAccess: storedAccess.recordAccess || {} } });
  } catch (error) {
    console.error('Get profile security error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile security' });
  }
});

router.put('/:profileId/security', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const data = updateSecuritySchema.parse(req.body);
    const profile = await prisma.profile.findFirst({ where: { id: req.params.profileId, tenantId: req.tenantId! }, select: { id: true, leadStatusAccess: true } });
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

    await prisma.$transaction(async (tx) => {
      if (data.objectPermissions) {
        await tx.profileObjectPermission.deleteMany({ where: { profileId: profile.id } });
        if (data.objectPermissions.length) await tx.profileObjectPermission.createMany({ data: data.objectPermissions.map((item) => ({ ...item, profileId: profile.id, tenantId: req.tenantId! })) });
      }
      if (data.fieldPermissions) {
        await tx.profileFieldPermission.deleteMany({ where: { profileId: profile.id } });
        if (data.fieldPermissions.length) await tx.profileFieldPermission.createMany({ data: data.fieldPermissions.map((item) => ({ ...item, profileId: profile.id, tenantId: req.tenantId! })) });
      }
      if (data.permissionIds) {
        await tx.userProfilePermission.deleteMany({ where: { profileId: profile.id } });
        if (data.permissionIds.length) await tx.userProfilePermission.createMany({ data: data.permissionIds.map((permissionId) => ({ profileId: profile.id, permissionId })) });
      }
      if (data.recordAccess) {
        const current = profile.leadStatusAccess && typeof profile.leadStatusAccess === 'object' && !Array.isArray(profile.leadStatusAccess) ? profile.leadStatusAccess as Record<string, any> : {};
        await tx.profile.update({ where: { id: profile.id }, data: { leadStatusAccess: { ...current, recordAccess: data.recordAccess } } });
      }
    });

    res.json({ success: true, message: 'Profile security updated' });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid security data' });
    console.error('Update profile security error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile security' });
  }
});

export default router;

import { Response, NextFunction } from 'express';
import { prisma } from '@dct-crm/db';
import { AuthRequest } from './auth';
import { EffectivePermissionService } from '../services/effectivePermissions';

export interface Permission {
  create?: boolean;
  read?: boolean;
  edit?: boolean;
  delete?: boolean;
  viewAll?: boolean;
  modifyAll?: boolean;
}

export const authorize = (objectName: string, requiredPermission: keyof Permission) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (req.user.isSuperAdmin) {
        return next();
      }

      const userRoles = await prisma.userRole.findMany({
        where: { userId: req.user.id },
        include: {
          role: {
            include: {
              permissionSets: {
                include: {
                  permissionSet: true,
                },
              },
            },
          },
        },
      });

      let hasPermission = false;

      for (const userRole of userRoles) {
        for (const rolePerm of userRole.role.permissionSets) {
          if (rolePerm.permissionSet.objectName === objectName) {
            const permissions = rolePerm.permissionSet.permissions as Permission;
            if (permissions[requiredPermission]) {
              hasPermission = true;
              break;
            }
          }
        }
        if (hasPermission) break;
      }

      if (!hasPermission) {
        const moduleName = objectName === 'AuditLog' ? 'AUDIT' : objectName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
        const actionName = requiredPermission === 'edit' ? 'UPDATE' : requiredPermission.toUpperCase();
        hasPermission = await EffectivePermissionService.hasPermission(req.user.id, `${moduleName}_${actionName}`);
      }

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: `Insufficient permissions for ${objectName}:${requiredPermission}`,
        });
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({ success: false, error: 'Authorization check failed' });
    }
  };
};

export const checkRecordAccess = async (
  userId: string,
  tenantId: string,
  objectName: string,
  recordId: string,
  action: 'read' | 'edit' | 'delete',
  isSuperAdmin?: boolean
): Promise<boolean> => {
  if (isSuperAdmin) return true;

  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissionSets: {
            include: {
              permissionSet: true,
            },
          },
        },
      },
    },
  });

  for (const userRole of userRoles) {
    for (const rolePerm of userRole.role.permissionSets) {
      if (rolePerm.permissionSet.objectName === objectName) {
        const permissions = rolePerm.permissionSet.permissions as Permission;
        
        if (permissions.modifyAll) return true;
        if (permissions.viewAll && action === 'read') return true;
        if (permissions[action]) return true;
      }
    }
  }

  return false;
};
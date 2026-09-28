import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { EffectivePermissionService } from '../services/effectivePermissions';

export const requirePermission = (permissionName: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (req.user.isSuperAdmin || req.user.isAdmin) {
        return next();
      }

      const result = await EffectivePermissionService.requirePermission(req.user.id, permissionName);

      if (!result.allowed) {
        return res.status(403).json({ success: false, error: result.error });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
};

export const requireAnyPermission = (permissionNames: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (req.user.isSuperAdmin || req.user.isAdmin) {
        return next();
      }

      const has = await EffectivePermissionService.hasAnyPermission(req.user.id, permissionNames);

      if (!has) {
        return res.status(403).json({
          success: false,
          error: `Permission denied: one of [${permissionNames.join(', ')}] required`,
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
};

export const loadEffectivePermissions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user) {
      req.effectivePermissions = await EffectivePermissionService.getEffectivePermissions(req.user.id);
    }
  } catch (error) {
    console.error('Failed to load effective permissions:', error);
  }
  next();
};

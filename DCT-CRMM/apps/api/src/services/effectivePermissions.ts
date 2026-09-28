import { prisma } from '@dct-crm/db';

export interface EffectivePermission {
  name: string;
  module: string;
  action: string;
  source: 'PROFILE' | 'PERMISSION_SET' | 'DIRECT' | 'LEGACY_ROLE';
  sourceName: string;
}

export interface PermissionCheckResult {
  hasPermission: boolean;
  permissions: string[];
  effectivePermissions: EffectivePermission[];
}

const FULL_SYSTEM_ACCESS = 'FULL_SYSTEM_ACCESS';

export class EffectivePermissionService {
  static async getEffectivePermissions(userId: string): Promise<EffectivePermission[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, profileId: true, tenantId: true, isActive: true, isSuperAdmin: true },
    });

    if (!user || !user.isActive) return [];

    if (user.isSuperAdmin) {
      return this.getAllSystemPermissions();
    }

    const [profilePerms, permSetPerms, directPerms, legacyPerms] = await Promise.all([
      this.getProfilePermissions(user.profileId),
      this.getPermissionSetPermissions(userId),
      this.getDirectPermissions(userId),
      this.getLegacyRolePermissions(userId),
    ]);

    const allPerms = [...profilePerms, ...permSetPerms, ...directPerms, ...legacyPerms];

    const deduplicated = this.deduplicatePermissions(allPerms);

    if (deduplicated.some((p) => p.name === FULL_SYSTEM_ACCESS)) {
      return this.getAllSystemPermissions();
    }

    return deduplicated;
  }

  static async getProfilePermissions(profileId: string | null): Promise<EffectivePermission[]> {
    if (!profileId) return [];

    const profilePerms = await prisma.userProfilePermission.findMany({
      where: { profileId },
      include: { permission: true },
    });

    return profilePerms.map((pp) => ({
      name: pp.permission.name,
      module: pp.permission.module,
      action: pp.permission.action,
      source: 'PROFILE' as const,
      sourceName: 'Profile',
    }));
  }

  static async getPermissionSetPermissions(userId: string): Promise<EffectivePermission[]> {
    const assignments = await prisma.userPermissionAssignment.findMany({
      where: { userId, permissionSet: { isActive: true } },
      include: {
        permissionSet: {
          include: {
            items: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const perms: EffectivePermission[] = [];
    for (const assignment of assignments) {
      for (const item of assignment.permissionSet.items) {
        perms.push({
          name: item.permission.name,
          module: item.permission.module,
          action: item.permission.action,
          source: 'PERMISSION_SET',
          sourceName: assignment.permissionSet.name,
        });
      }
    }
    return perms;
  }

  static async getDirectPermissions(userId: string): Promise<EffectivePermission[]> {
    const directPerms = await prisma.userDirectPermission.findMany({
      where: { userId },
      include: { permission: true },
    });

    return directPerms.map((dp) => ({
      name: dp.permission.name,
      module: dp.permission.module,
      action: dp.permission.action,
      source: 'DIRECT',
      sourceName: 'Direct User Permission',
    }));
  }

  static async getLegacyRolePermissions(userId: string): Promise<EffectivePermission[]> {
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissionSets: {
              include: { permissionSet: true },
            },
          },
        },
      },
    });

    const OBJECT_TO_MODULE: Record<string, string> = {
      'Lead': 'LEAD',
      'SiteVisit': 'SITE_VISIT',
      'Opportunity': 'OPPORTUNITY',
      'Quotation': 'QUOTATION',
      'Booking': 'BOOKING',
      'Payment': 'PAYMENT',
      'Project': 'PROJECT',
      'Task': 'TASK',
      'FollowUp': 'FOLLOW_UP',
      'Report': 'REPORT',
      'User': 'USER',
      'Role': 'ROLE',
    };

    const ACTION_MAP: Record<string, string> = {
      'create': 'CREATE',
      'read': 'READ',
      'edit': 'UPDATE',
      'delete': 'DELETE',
      'viewAll': 'VIEW_ALL',
      'modifyAll': 'MODIFY_ALL',
    };

    const perms: EffectivePermission[] = [];
    for (const userRole of userRoles) {
      for (const rolePerm of userRole.role.permissionSets) {
        const jsonPerms = rolePerm.permissionSet.permissions as Record<string, boolean>;
        const objectName = rolePerm.permissionSet.objectName;
        const module = OBJECT_TO_MODULE[objectName] || objectName.toUpperCase();

        for (const [action, enabled] of Object.entries(jsonPerms)) {
          if (enabled && ACTION_MAP[action]) {
            const permAction = ACTION_MAP[action];
            perms.push({
              name: `${module}_${permAction}`,
              module,
              action: permAction,
              source: 'LEGACY_ROLE',
              sourceName: userRole.role.name,
            });
          }
        }
      }
    }
    return perms;
  }

  static deduplicatePermissions(perms: EffectivePermission[]): EffectivePermission[] {
    const seen = new Map<string, EffectivePermission>();
    const priority = { PROFILE: 0, PERMISSION_SET: 1, DIRECT: 2, LEGACY_ROLE: 3 };

    for (const perm of perms) {
      const existing = seen.get(perm.name);
      if (!existing || priority[perm.source] < priority[existing.source]) {
        seen.set(perm.name, perm);
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.module.localeCompare(b.module) || a.action.localeCompare(b.action));
  }

  static async getAllSystemPermissions(): Promise<EffectivePermission[]> {
    const allPerms = await prisma.permission.findMany({ where: { isActive: true } });
    return allPerms.map((p) => ({
      name: p.name,
      module: p.module,
      action: p.action,
      source: 'PROFILE' as const,
      sourceName: 'Full System Access',
    }));
  }

  static async hasPermission(userId: string, permissionName: string): Promise<boolean> {
    const perms = await this.getEffectivePermissions(userId);
    return perms.some((p) => p.name === permissionName) || perms.some((p) => p.name === FULL_SYSTEM_ACCESS);
  }

  static async hasAnyPermission(userId: string, permissionNames: string[]): Promise<boolean> {
    const perms = await this.getEffectivePermissions(userId);
    if (perms.some((p) => p.name === FULL_SYSTEM_ACCESS)) return true;
    return permissionNames.some((name) => perms.some((p) => p.name === name));
  }

  static async requirePermission(userId: string, permissionName: string): Promise<{ allowed: boolean; error?: string }> {
    const has = await this.hasPermission(userId, permissionName);
    if (!has) {
      return { allowed: false, error: `Permission denied: ${permissionName} required` };
    }
    return { allowed: true };
  }

  static async getUserPermissionsSummary(userId: string) {
    const effective = await this.getEffectivePermissions(userId);

    const byModule: Record<string, EffectivePermission[]> = {};
    for (const perm of effective) {
      if (!byModule[perm.module]) byModule[perm.module] = [];
      byModule[perm.module].push(perm);
    }

    return {
      permissions: effective,
      byModule,
      total: effective.length,
      hasFullAccess: effective.some((p) => p.name === FULL_SYSTEM_ACCESS),
    };
  }
}

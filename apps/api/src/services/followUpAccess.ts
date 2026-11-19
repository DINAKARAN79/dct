import { getRecordScope, type AuthUserLike } from './recordAccess';

type FollowUpActor = AuthUserLike;

function scopeOwnerIds(scope: Awaited<ReturnType<typeof getRecordScope>>): string[] | null {
  if (scope.type === 'ALL') return null;
  return scope.type === 'OWNER' ? [scope.userId] : scope.userIds;
}

export async function followUpAccessWhere(
  user: FollowUpActor,
  tenantId = user.tenantId,
): Promise<{ tenantId: string; ownerId?: { in: string[] } }> {
  const scope = await getRecordScope(user, 'FollowUp', 'FOLLOW_UP');
  const ownerIds = scopeOwnerIds(scope);
  return ownerIds ? { tenantId, ownerId: { in: ownerIds } } : { tenantId };
}

export function followUpWriteAccessWhere(
  user: FollowUpActor,
  tenantId = user.tenantId,
): { tenantId: string; ownerId?: string } {
  if (user.isSuperAdmin || user.isAdmin) return { tenantId };
  return { tenantId, ownerId: user.id };
}

export async function followUpOwnerClause(
  user: FollowUpActor,
): Promise<{ ownerId?: { in: string[] } }> {
  const access = await followUpAccessWhere(user);
  return access.ownerId ? { ownerId: access.ownerId } : {};
}

export async function canAccessFollowUpRecord(
  user: FollowUpActor,
  followUp: { tenantId: string; ownerId: string | null },
): Promise<boolean> {
  if (!user.isSuperAdmin && followUp.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'FollowUp', 'FOLLOW_UP');
  return scope.type === 'ALL' || Boolean(followUp.ownerId && scopeOwnerIds(scope)?.includes(followUp.ownerId));
}

/** Follow-up report rows are restricted by the record-access scope. */
export function followUpReportShowMe(
  _objectName: string,
  _user: Pick<FollowUpActor, 'isAdmin' | 'isSuperAdmin'>,
  requested: 'all' | 'mine' | 'team',
): 'all' | 'mine' | 'team' {
  return requested;
}

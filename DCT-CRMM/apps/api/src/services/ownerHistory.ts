import { prisma } from '@dct-crm/db';

export async function createOwnerHistory(params: {
  tenantId: string;
  leadId: string;
  previousOwnerId: string | null;
  newOwnerId: string | null;
  previousProfile: string | null;
  newProfile: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  handoffReason: string;
  changedById: string;
}) {
  const now = new Date();

  const currentHistory = await prisma.leadOwnerHistory.findFirst({
    where: {
      leadId: params.leadId,
      endDate: null,
    },
  });

  if (currentHistory) {
    await prisma.leadOwnerHistory.update({
      where: { id: currentHistory.id },
      data: { endDate: now },
    });
  }

  const newHistory = await prisma.leadOwnerHistory.create({
    data: {
      tenantId: params.tenantId,
      leadId: params.leadId,
      previousOwnerId: params.previousOwnerId,
      newOwnerId: params.newOwnerId,
      previousProfile: params.previousProfile,
      newProfile: params.newProfile,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      handoffReason: params.handoffReason,
      changedById: params.changedById,
      startDate: now,
      endDate: null,
    },
  });

  return newHistory;
}

export async function getOwnerHistory(tenantId: string, leadId: string) {
  return prisma.leadOwnerHistory.findMany({
    where: { tenantId, leadId },
    include: {
      previousOwner: { select: { id: true, firstName: true, lastName: true } },
      newOwner: { select: { id: true, firstName: true, lastName: true } },
      changedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { startDate: 'asc' },
  });
}

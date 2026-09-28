import { prisma } from '@dct-crm/db';

export interface RoundRobinResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

async function getConfiguredMembers(tenantId: string, poolType: string): Promise<RoundRobinResult[]> {
  return prisma.roundRobinMember.findMany({
    where: {
      tenantId,
      poolType,
      isActive: true,
      user: { isActive: true },
    },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  }).then((members) =>
    members.map((m) => ({
      id: m.user.id,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
    }))
  );
}

async function pickNextUser(
  users: RoundRobinResult[],
  tenantId: string,
  queueType: string,
): Promise<RoundRobinResult | null> {
  if (users.length === 0) return null;

  const queue = await prisma.queue.findFirst({
    where: { tenantId, type: queueType },
  });

  let lastIndex = -1;
  if (queue && queue.description) {
    const parsed = parseInt(queue.description, 10);
    if (!isNaN(parsed)) lastIndex = parsed;
  }

  const nextIndex = (lastIndex + 1) % users.length;

  if (queue) {
    await prisma.queue.update({
      where: { id: queue.id },
      data: { description: String(nextIndex) },
    });
  } else {
    await prisma.queue.create({
      data: {
        tenantId,
        name: `${queueType.replace(/_/g, ' ')} Queue`,
        type: queueType,
        isActive: true,
        description: String(nextIndex),
      },
    });
  }

  return users[nextIndex];
}

export async function getNextSVCUser(tenantId: string): Promise<RoundRobinResult | null> {
  const users = await getConfiguredMembers(tenantId, 'SVC');
  return pickNextUser(users, tenantId, 'SVC_ROUND_ROBIN');
}

export async function getNextSalesUser(tenantId: string): Promise<RoundRobinResult | null> {
  const users = await getConfiguredMembers(tenantId, 'SALES');
  return pickNextUser(users, tenantId, 'SALES_ROUND_ROBIN');
}

export async function getNextPresalesUser(tenantId: string): Promise<RoundRobinResult | null> {
  const users = await getConfiguredMembers(tenantId, 'PRESALES');
  return pickNextUser(users, tenantId, 'PRESALES_ROUND_ROBIN');
}

export async function getNextUserByPool(tenantId: string, poolType: string): Promise<RoundRobinResult | null> {
  const users = await getConfiguredMembers(tenantId, poolType);
  return pickNextUser(users, tenantId, `${poolType}_ROUND_ROBIN`);
}

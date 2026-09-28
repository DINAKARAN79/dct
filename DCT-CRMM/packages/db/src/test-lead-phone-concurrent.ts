import { prisma } from '@dct-crm/db';

async function main() {
  const nulls = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as count FROM "Lead" WHERE "phone" IS NULL
  `);
  console.log('NULL phones (unchanged legacy):', JSON.stringify(nulls));

  const uniqueIdx = await prisma.$queryRawUnsafe(`
    SELECT indexdef FROM pg_indexes
    WHERE tablename = 'Lead' AND indexname = 'Lead_tenantId_phone_key'
  `);
  console.log('Unique index:', JSON.stringify(uniqueIdx));

  // Concurrent same-phone inserts must yield one success + unique violation
  const tenant = await prisma.tenant.findFirstOrThrow();
  const creator = await prisma.user.findFirstOrThrow({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
  });
  const phone = `+91-9${Date.now().toString().slice(-10)}`;
  const make = (lastName: string) =>
    prisma.lead.create({
      data: {
        tenantId: tenant.id,
        creatorId: creator.id,
        lastName,
        company: 'RaceDb',
        phone,
        source: 'OTHER',
        status: 'NEW',
      },
      select: { id: true },
    });

  const settled = await Promise.allSettled([make('One'), make('Two')]);
  const ok = settled.filter((s) => s.status === 'fulfilled').length;
  const rejected = settled.filter((s) => s.status === 'rejected');
  const p2002 = rejected.filter(
    (s) => (s as PromiseRejectedResult).reason?.code === 'P2002',
  ).length;
  console.log('DB concurrent create: ok=', ok, 'rejected=', rejected.length, 'P2002=', p2002);

  const winner = settled.find((s) => s.status === 'fulfilled') as
    | PromiseFulfilledResult<{ id: string }>
    | undefined;
  if (winner) {
    await prisma.lead.delete({ where: { id: winner.value.id } });
    console.log('Cleaned race lead', winner.value.id);
  }

  if (ok !== 1 || p2002 !== 1) {
    throw new Error(
      `Expected one success and one P2002, got ok=${ok} p2002=${p2002}`,
    );
  }
  console.log('DB concurrent uniqueness OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

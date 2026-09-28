import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROFILE_DEFINITIONS = [
  {
    name: 'Admin',
    description: 'Administrative profile with full platform access',
    isAdmin: true,
    isDefault: false,
  },
  {
    name: 'Sales Manager',
    description: 'Sales leadership profile with team oversight',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'Sales Executive',
    description: 'Sales profile for leads, opportunities and own-record updates',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'Sales',
    description: 'Sales profile for site visit completion and opportunity handling',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'Presales',
    description: 'Presales profile for site visits and project support',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'Finance',
    description: 'Finance profile for payments and accounting visibility',
    isAdmin: false,
    isDefault: false,
  },
] as const;

const PROFILE_PERMISSIONS: Record<string, string[]> = {
  Admin: ['FULL_SYSTEM_ACCESS'],
  'Sales Manager': [
    'LEAD_READ',
    'LEAD_CREATE',
    'LEAD_UPDATE',
    'LEAD_ASSIGN',
    'LEAD_CONVERT',
    'OPPORTUNITY_READ',
    'OPPORTUNITY_CREATE',
    'OPPORTUNITY_UPDATE',
    'QUOTATION_READ',
    'QUOTATION_CREATE',
    'QUOTATION_UPDATE',
    'BOOKING_READ',
    'BOOKING_CREATE',
    'BOOKING_UPDATE',
    'SITE_VISIT_READ',
    'SITE_VISIT_UPDATE',
    'REPORT_VIEW',
    'DASHBOARD_READ',
    'TASK_READ',
    'TASK_CREATE',
    'TASK_UPDATE',
  ],
  'Sales Executive': [
    'LEAD_READ',
    'LEAD_CREATE',
    'LEAD_UPDATE',
    'OPPORTUNITY_READ',
    'OPPORTUNITY_CREATE',
    'OPPORTUNITY_UPDATE',
    'SITE_VISIT_READ',
    'SITE_VISIT_UPDATE',
    'TASK_READ',
    'TASK_CREATE',
    'TASK_UPDATE',
    'REPORT_VIEW',
    'DASHBOARD_READ',
  ],
  Sales: [
    'LEAD_READ',
    'LEAD_CREATE',
    'LEAD_UPDATE',
    'OPPORTUNITY_READ',
    'OPPORTUNITY_CREATE',
    'OPPORTUNITY_UPDATE',
    'SITE_VISIT_READ',
    'SITE_VISIT_UPDATE',
    'TASK_READ',
    'TASK_CREATE',
    'TASK_UPDATE',
    'REPORT_VIEW',
    'DASHBOARD_READ',
  ],
  Presales: [
    'LEAD_READ',
    'SITE_VISIT_READ',
    'SITE_VISIT_CREATE',
    'SITE_VISIT_UPDATE',
    'PROJECT_READ',
    'PROJECT_UPDATE',
    'REPORT_VIEW',
  ],
  Finance: [
    'PAYMENT_READ',
    'PAYMENT_CREATE',
    'PAYMENT_UPDATE',
    'PAYMENT_VERIFY',
    'PAYMENT_APPROVE',
    'FINANCE_READ',
    'FINANCE_MANAGE',
    'BOOKING_READ',
    'BOOKING_UPDATE',
    'REPORT_VIEW',
    'DASHBOARD_READ',
  ],
};

const DATA_ADMINISTRATION_PERMISSIONS = [
  'DATA_IMPORT',
  'DATA_EXPORT',
  'DUPLICATE_MANAGEMENT',
  'RECYCLE_BIN',
];

async function main() {
  console.log('Seeding CRM profiles and profile permissions...');

  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'dct-re' },
    select: { id: true, name: true },
  });

  if (!tenant) {
    throw new Error('Tenant dct-re not found. Run the DB seed first.');
  }

  const createdProfiles: Record<string, { id: string; name: string }> = {};

  for (const profile of PROFILE_DEFINITIONS) {
    const existing = await prisma.profile.findUnique({
      where: { tenantId_name: { tenantId: tenant.id, name: profile.name } },
      select: { id: true, name: true },
    });

    if (existing) {
      const updated = await prisma.profile.update({
        where: { id: existing.id },
        data: {
          description: profile.description,
          isAdmin: profile.isAdmin,
          isDefault: profile.isDefault,
        },
        select: { id: true, name: true },
      });
      createdProfiles[profile.name] = updated;
      console.log(`Profile already exists (updated): ${profile.name}`);
      continue;
    }

    const created = await prisma.profile.create({
      data: {
        tenantId: tenant.id,
        name: profile.name,
        description: profile.description,
        isAdmin: profile.isAdmin,
        isDefault: profile.isDefault,
      },
      select: { id: true, name: true },
    });

    createdProfiles[profile.name] = created;
    console.log(`Created profile: ${created.name}`);
  }

  const allPermissionNames = new Set<string>();
  for (const name of DATA_ADMINISTRATION_PERMISSIONS) allPermissionNames.add(name);
  for (const names of Object.values(PROFILE_PERMISSIONS)) {
    for (const name of names) allPermissionNames.add(name);
  }

  for (const permissionName of allPermissionNames) {
    const module = DATA_ADMINISTRATION_PERMISSIONS.includes(permissionName)
      ? 'DATA'
      : permissionName.split('_')[0];
    await prisma.permission.upsert({
      where: { name: permissionName },
      update: { module },
      create: {
        name: permissionName,
        label: permissionName.replace(/_/g, ' '),
        module,
        action: permissionName.split('_').slice(1).join('_') || 'READ',
      },
    });
  }

  for (const [profileName, permissionNames] of Object.entries(PROFILE_PERMISSIONS)) {
    const profile = createdProfiles[profileName];
    if (!profile) {
      console.warn(`Missing profile for permission assignment: ${profileName}`);
      continue;
    }

    const permissionIds = await prisma.permission.findMany({
      where: { name: { in: permissionNames } },
      select: { id: true, name: true },
    });

    const permissionIdMap = new Map(permissionIds.map((p) => [p.name, p.id]));
    const validIds = permissionNames
      .map((p) => permissionIdMap.get(p))
      .filter((id): id is string => Boolean(id));

    await prisma.userProfilePermission.deleteMany({ where: { profileId: profile.id } });
    if (validIds.length > 0) {
      await prisma.userProfilePermission.createMany({
        data: validIds.map((permissionId) => ({ profileId: profile.id, permissionId })),
      });
    }

    console.log(`Assigned ${validIds.length} permissions to ${profileName}`);
  }

  const leftover = await prisma.permission.deleteMany({
    where: {
      OR: [
        { name: { startsWith: 'CONTACT_' } },
        { name: { startsWith: 'CUSTOMER_' } },
        { name: { startsWith: 'ACCOUNT_' } },
        { module: { in: ['CONTACT', 'CUSTOMER', 'ACCOUNT'] } },
      ],
    },
  });
  console.log(`Removed ${leftover.count} leftover Contact/Customer/Account permissions`);

  const usersToAssign = [
    { email: 'admin@dctcrm.com', profileName: 'Admin' },
    { email: 'salesmanager@dctcrm.com', profileName: 'Sales Manager' },
    { email: 'priya@dctcrm.com', profileName: 'Sales Executive' },
    { email: 'amit@dctcrm.com', profileName: 'Sales Executive' },
    { email: 'neha@dctcrm.com', profileName: 'Presales' },
    { email: 'finance@dctcrm.com', profileName: 'Finance' },
  ] as const;

  for (const assignment of usersToAssign) {
    const profile = createdProfiles[assignment.profileName];
    if (!profile) {
      console.warn(`Missing profile for assignment: ${assignment.profileName}`);
      continue;
    }

    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, email: assignment.email },
      select: { id: true, email: true, profileId: true },
    });

    if (!user) {
      console.warn(`User not found for assignment: ${assignment.email}`);
      continue;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { profileId: profile.id },
    });

    console.log(`Assigned ${assignment.email} -> ${assignment.profileName}`);
  }

  console.log('Profile seeding complete.');
}

main()
  .catch((error) => {
    console.error('Failed to seed CRM profiles:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
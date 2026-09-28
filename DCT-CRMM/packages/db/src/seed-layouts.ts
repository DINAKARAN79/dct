import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Section {
  name: string;
  fields: string[];
}

const LEAD_LAYOUT_SECTIONS: Section[] = [
  {
    name: 'Contact Information',
    fields: ['salutation', 'firstName', 'lastName', 'title', 'email', 'phone', 'mobile'],
  },
  {
    name: 'Company Information',
    fields: ['company', 'industry', 'annualRevenue', 'numberOfEmployees'],
  },
  {
    name: 'Lead Details',
    fields: ['source', 'status', 'rating', 'description'],
  },
  {
    name: 'Address',
    fields: ['street', 'city', 'stateProvince', 'country', 'postalCode'],
  },
  {
    name: 'System Information',
    fields: ['record_number', 'owner', 'created_by', 'created_at', 'updated_at'],
  },
];

const OBJECT_LAYOUT_SECTIONS: Record<string, Section[]> = {
  Lead: LEAD_LAYOUT_SECTIONS,
};

function buildDefaultSections(objectName: string, fieldNames: string[]): Section[] {
  const override = OBJECT_LAYOUT_SECTIONS[objectName];
  if (override) {
    return override;
  }

  const systemFields = fieldNames.filter((f) =>
    ['record_number', 'owner', 'created_by', 'created_at', 'updated_at', 'is_active'].includes(f),
  );
  const dataFields = fieldNames.filter((f) => !systemFields.includes(f));

  const sections: Section[] = [];

  if (dataFields.length > 8) {
    const midpoint = Math.ceil(dataFields.length / 2);
    sections.push({ name: 'Information', fields: dataFields.slice(0, midpoint) });
    sections.push({ name: 'More Information', fields: dataFields.slice(midpoint) });
  } else if (dataFields.length > 0) {
    sections.push({ name: 'Information', fields: dataFields });
  }

  if (systemFields.length > 0) {
    sections.push({ name: 'System Information', fields: systemFields });
  }

  return sections;
}

export async function ensureDefaultLayoutForObjects() {
  console.log('Ensuring default layouts for all objects...\n');

  const tenants = await prisma.tenant.findMany({ where: { isActive: true } });

  if (tenants.length === 0) {
    console.log('No active tenants found. Skipping.');
    return;
  }

  for (const tenant of tenants) {
    console.log(`Processing tenant: ${tenant.name} (${tenant.id})`);

    const adminUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!adminUser) {
      console.log(`  No users found for tenant. Skipping.`);
      continue;
    }

    const objects = await prisma.objectDefinition.findMany({
      where: { tenantId: tenant.id, isActive: true },
      include: {
        fields: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    let createdCount = 0;
    let skippedCount = 0;

    for (const object of objects) {
      const existingLayout = await prisma.pageLayout.findFirst({
        where: {
          objectId: object.id,
          name: 'Default Layout',
        },
      });

      if (existingLayout) {
        skippedCount++;
        continue;
      }

      const fieldNames = object.fields.map((f) => f.name);
      const sections = buildDefaultSections(object.name, fieldNames);

      await prisma.pageLayout.create({
        data: {
          tenantId: tenant.id,
          objectId: object.id,
          name: 'Default Layout',
          isDefault: true,
          sections: JSON.stringify(sections),
          createdBy: adminUser.id,
        },
      });

      console.log(`  Created Default Layout for ${object.name} (${sections.length} sections)`);
      createdCount++;
    }

    console.log(`  Tenant summary: created=${createdCount}, skipped=${skippedCount}\n`);
  }

  console.log('Default layouts seeded successfully!');
}

export async function ensureDefaultLayoutForObject(tenantId: string, objectName: string) {
  const adminUser = await prisma.user.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!adminUser) {
    throw new Error(`No active user found for tenant ${tenantId}`);
  }

  const object = await prisma.objectDefinition.findFirst({
    where: {
      tenantId,
      name: { equals: objectName, mode: 'insensitive' },
      isActive: true,
    },
    include: {
      fields: {
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
      },
    },
  });

  if (!object) {
    throw new Error(`Object "${objectName}" not found for tenant ${tenantId}`);
  }

  const existingLayout = await prisma.pageLayout.findFirst({
    where: {
      objectId: object.id,
      name: 'Default Layout',
    },
  });

  if (existingLayout) {
    console.log(`Default Layout already exists for ${objectName}. Skipping.`);
    return existingLayout;
  }

  const fieldNames = object.fields.map((f) => f.name);
  const sections = buildDefaultSections(object.name, fieldNames);

  const layout = await prisma.pageLayout.create({
    data: {
      tenantId,
      objectId: object.id,
      name: 'Default Layout',
      isDefault: true,
      sections: JSON.stringify(sections),
      createdBy: adminUser.id,
    },
  });

  console.log(`Created Default Layout for ${objectName} (${sections.length} sections)`);
  return layout;
}

async function main() {
  await ensureDefaultLayoutForObjects();
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

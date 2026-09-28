-- Tenant-scoped unique phone for Lead (applied via prisma db push after duplicate resolution)
-- Clears newer duplicates first (resolve-lead-phone-duplicates.ts), then:
DROP INDEX IF EXISTS "Lead_tenantId_phone_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_tenantId_phone_key" ON "Lead"("tenantId", "phone");

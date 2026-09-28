DELETE FROM "AuditLog" WHERE "tenantId" IN (SELECT "id" FROM "Tenant" WHERE "companyCode" IN ('FULL-TEST', 'TEMP-CORP'));
DELETE FROM "Tenant" WHERE "companyCode" IN ('FULL-TEST', 'TEMP-CORP');

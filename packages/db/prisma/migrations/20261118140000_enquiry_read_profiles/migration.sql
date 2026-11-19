INSERT INTO "Permission" ("id", "name", "label", "module", "action", "isActive", "createdAt", "updatedAt")
VALUES (
  'perm_enquiry_read',
  'ENQUIRY_READ',
  'ENQUIRY READ',
  'ENQUIRY',
  'READ',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE SET "isActive" = true;

INSERT INTO "UserProfilePermission" ("id", "profileId", "permissionId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || profile."id" || permission."id"),
  profile."id",
  permission."id",
  CURRENT_TIMESTAMP
FROM "Profile" profile
CROSS JOIN "Permission" permission
WHERE permission."name" = 'ENQUIRY_READ'
  AND (
    lower(btrim(profile."name")) IN ('presales', 'pre-sales', 'svc', 'sales', 'recovery', 'crm')
    OR profile."isAdmin" = true
    OR lower(btrim(profile."name")) IN ('admin', 'system administrator')
  )
ON CONFLICT ("profileId", "permissionId") DO NOTHING;

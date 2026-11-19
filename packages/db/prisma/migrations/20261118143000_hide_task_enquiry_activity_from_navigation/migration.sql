UPDATE "ObjectDefinition"
SET "isAvailableInNavigation" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE LOWER("name") IN ('activity', 'enquiry', 'task')
  AND "isAvailableInNavigation" = true;

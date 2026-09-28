SELECT COUNT(*) as total FROM "Permission";
SELECT module, COUNT(*) as count FROM "Permission" GROUP BY module ORDER BY module;

-- Deprecated duplicate baseline.
--
-- Keep this filename as a no-op so environments that already recorded this
-- migration retain their history. The canonical schema starts at
-- 00001_initial_schema.sql and is evolved only by later incremental
-- migrations. The former contents declared a second, incompatible set of user
-- and alert tables; replaying it produced a database shape that depended on
-- which baseline happened to run first.
--
-- Do not add schema changes here. Add a new incremental migration instead.
DO $migration$
BEGIN
  RAISE NOTICE '001_initial_schema.sql is deprecated; no changes applied';
END
$migration$;

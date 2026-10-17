-- Adds the combi-route columns to a database created before they existed.
--
-- Fresh databases get these columns from schema.sql. SQLite has no
-- `ADD COLUMN IF NOT EXISTS`, so a database created earlier needs this once:
--
--   npx wrangler d1 execute myroute --file=./migrations/0001_paths_combi.sql --remote
--   (drop --remote to apply it to the local dev database)
--
-- Running it twice fails on the duplicate column, which is harmless: the schema
-- is already up to date at that point.

ALTER TABLE paths ADD COLUMN kind TEXT NOT NULL DEFAULT 'path';
ALTER TABLE paths ADD COLUMN combi_name TEXT NOT NULL DEFAULT '';
ALTER TABLE paths ADD COLUMN rank TEXT NOT NULL DEFAULT '';
ALTER TABLE paths ADD COLUMN waypoints TEXT NOT NULL DEFAULT '[]';

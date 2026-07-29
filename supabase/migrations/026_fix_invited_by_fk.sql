-- =============================================================================
-- Migration 026: Fix team_members.invited_by foreign key
--
-- 001_auth_tables.sql declared `invited_by uuid REFERENCES team_members (id)`
-- with no ON DELETE clause, so Postgres defaulted to NO ACTION. Deleting a
-- member who had invited somebody failed with:
--   update or delete on table "team_members" violates foreign key constraint
--   "team_members_invited_by_fkey" on table "team_members"
--
-- invited_by is historical bookkeeping only, so SET NULL matches reports_to
-- (see 002_schema_updates_and_projects.sql).
-- =============================================================================

ALTER TABLE team_members
  DROP CONSTRAINT IF EXISTS team_members_invited_by_fkey;

ALTER TABLE team_members
  ADD CONSTRAINT team_members_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES team_members (id) ON DELETE SET NULL;

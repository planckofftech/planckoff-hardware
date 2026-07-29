-- =============================================================================
-- Migration 027: Move the last `admins` row into `team_members`
--
-- `admins` (001_auth_tables.sql, "legacy superusers") held exactly one row —
-- harsh@planckoff.com. Every other user, including the other Administrators,
-- already lives in `team_members` with role_id → roles('Administrator').
--
-- That split is what makes the Team Management screen inconsistent: rows
-- sourced from `admins` get no Delete and no status control, because `admins`
-- has no status column and the UI gates moderation on source = 'team_member'.
--
-- Harsh is offboarded rather than deleted. `projects.created_by` and
-- `projects.assigned_to` carry NO foreign key (they may hold an id from
-- either table), and 14 projects currently reference his id:
--   created_by  → 3   (Optum Health, ICBC Burnaby, 324-035 NAV Can)
--   assigned_to → 11  (Optum Health, SETON MARKET STREET B1, Pleasant Grove, …)
-- Hard-deleting would leave all 14 pointing at a non-existent user forever.
--
-- Carrying the SAME id across to team_members keeps every one of those
-- references valid while status = 'Inactive' blocks login. Reversible: flip
-- the status back to 'Active'.
--
-- His auth_sessions rows are removed by ON DELETE CASCADE on
-- auth_sessions.admin_id, so any live session dies with the admins row.
-- =============================================================================

BEGIN;

-- 1. Copy the row across, preserving id so project references stay intact.
INSERT INTO team_members (id, email, password_hash, name, role_id, status, initials, created_at)
SELECT
  a.id,
  a.email,
  a.password_hash,
  a.name,
  (SELECT r.id FROM roles r WHERE r.name = 'Administrator'),
  'Inactive',
  a.initials,
  a.created_at
FROM admins a
WHERE a.email = 'harsh@planckoff.com'
ON CONFLICT (id) DO NOTHING;

-- 2. Drop the admins row. Cascades to auth_sessions.admin_id, ending his sessions.
DELETE FROM admins WHERE email = 'harsh@planckoff.com';

-- 3. Fail loudly if anything is left behind — `admins` must now be empty, or
--    the UI keeps its two-source split and role changes stay impossible.
DO $$
DECLARE
  remaining int;
  migrated  int;
BEGIN
  SELECT count(*) INTO remaining FROM admins;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'admins still has % row(s); migration 027 expects it to be empty', remaining;
  END IF;

  SELECT count(*) INTO migrated
  FROM team_members
  WHERE email = 'harsh@planckoff.com' AND status = 'Inactive';
  IF migrated <> 1 THEN
    RAISE EXCEPTION 'expected 1 inactive team_members row for harsh@planckoff.com, found %', migrated;
  END IF;
END $$;

COMMIT;

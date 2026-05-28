-- Hard-deleting a member (auth.admin.deleteUser → ON DELETE CASCADE to profiles)
-- was blocked whenever the member had history in a table whose FK to profiles(id)
-- used the Postgres default (NO ACTION / RESTRICT). The cascade then raised a
-- foreign-key violation, surfacing in the admin UI as a generic error boundary.
--
-- Convert every blocking "owned/authored by" reference to ON DELETE SET NULL so a
-- deleted account's events/reports/etc. survive with a null (orphaned) owner.

-- channels.creator_id is NOT NULL; relax it so it can be nulled on delete.
ALTER TABLE channels ALTER COLUMN creator_id DROP NOT NULL;

-- Drop the existing FK on each (table, column) regardless of its constraint name,
-- then re-add it as ON DELETE SET NULL. Dropping dynamically avoids leaving an old
-- RESTRICT constraint behind if it was named non-conventionally.
DO $$
DECLARE
  target   record;
  conname  text;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('events',           'host_id'),
      ('crew_completions', 'verified_by'),
      ('reports',          'reviewed_by'),
      ('channels',         'creator_id'),
      ('nexus_regions',    'mentor_id')
    ) AS t(tbl, col)
  LOOP
    -- Skip tables that don't exist on this database (e.g. legacy ones dropped
    -- by a later migration), so the migration stays robust across environments.
    IF to_regclass('public.' || target.tbl) IS NULL THEN
      CONTINUE;
    END IF;

    FOR conname IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class      rel ON rel.oid = con.conrelid
      JOIN pg_namespace  ns  ON ns.oid  = rel.relnamespace
      WHERE con.contype = 'f'
        AND ns.nspname  = 'public'
        AND rel.relname = target.tbl
        AND con.conkey  = ARRAY[
          (SELECT attnum FROM pg_attribute
            WHERE attrelid = rel.oid AND attname = target.col AND NOT attisdropped)
        ]
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', target.tbl, conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
      || 'REFERENCES profiles (id) ON DELETE SET NULL',
      target.tbl, target.tbl || '_' || target.col || '_fkey', target.col
    );
  END LOOP;
END $$;

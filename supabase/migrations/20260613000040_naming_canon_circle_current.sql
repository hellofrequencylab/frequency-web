-- =============================================================================
-- Naming Canon 2026 — Wave 2 (4/5): Circle Field → Circle Current
-- Canon: docs/NAMING.md · Plan: docs/naming/PLAN.md §Wave 2 · ADR-208
--
-- WHY: "Circle Current" is the locked term for a circle's collective, non-competitive
-- seasonal standing; "Circle Field" / "the Field" is RETIRED (NAMING.md §Connection
-- layer). The schema still speaks the old name across a column, a ledger table, a
-- trigger + its function, RLS, and reset_season(). This renames the whole cluster to
-- canon, in place, data-preserving. The locked internal column name is
-- `circles.season_current` (NOT a literal `current_season_field`→`current_season_current`
-- rename, which would read awkwardly — canon picks `season_current`).
--
-- DESIGN (data-preserving, idempotent):
--   * Rename table   circle_field_transactions → circle_current_transactions  (rows,
--     PK, FKs carried by OID). Rename its four indexes to the canon stem.
--   * Rename column  circles.current_season_field → circles.season_current  (values
--     preserved; the column is an integer running total).
--   * Recreate the trigger FUNCTION after_circle_field_transaction() as
--     after_circle_current_transaction() (newest gen 20260610000000_circle_field.sql),
--     writing circles.season_current; re-point the trigger at the renamed table; drop
--     the old function. The trigger is the SINGLE writer of the running total.
--   * Recreate the SELECT RLS policy under the canon name on the renamed table
--     (predicate identical — members or public-when-resonance_public).
--   * Recreate reset_season() (newest gen is THIS migration's predecessor —
--     20260613000030_naming_canon_ranks, which already carries the renamed rank
--     labels) with the column zeroing changed to circles.season_current. Only that
--     one line differs from the rank migration's body.
--   * Rename the follow-on profile_id index added in 20260610030000.
--   All renames guarded so re-runs are no-ops.
--
-- RLS: the read policy is recreated identically (name canonized). Still
--   service-role-write-only (no insert/update policy).
-- NOTE: lib/database.types.ts must be regenerated after apply.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Rename the ledger table + its indexes.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'circle_field_transactions')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'circle_current_transactions') THEN
    ALTER TABLE public.circle_field_transactions RENAME TO circle_current_transactions;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.idx_circle_field_transactions_circle  RENAME TO idx_circle_current_transactions_circle;
ALTER INDEX IF EXISTS public.idx_circle_field_transactions_event   RENAME TO idx_circle_current_transactions_event;
ALTER INDEX IF EXISTS public.idx_circle_field_transactions_created RENAME TO idx_circle_current_transactions_created;
-- profile_id index added in 20260610030000_events_security_hardening.sql
ALTER INDEX IF EXISTS public.circle_field_transactions_profile_idx RENAME TO circle_current_transactions_profile_idx;

-- ---------------------------------------------------------------------------
-- 2. Rename the running-total column on circles.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'circles'
               AND column_name = 'current_season_field')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'circles'
               AND column_name = 'season_current') THEN
    ALTER TABLE public.circles RENAME COLUMN current_season_field TO season_current;
  END IF;
END $$;

COMMENT ON COLUMN public.circles.season_current IS
  'Collective Circle Current standing for the active season (sum of circle_current_transactions.amount). Maintained solely by the after_circle_current_transaction trigger; zeroed by reset_season(). Collaborative, never an inter-circle ranking.';

-- ---------------------------------------------------------------------------
-- 3. Recreate the trigger function under the canon name (writes season_current),
--    re-point the trigger at the renamed table, drop the old function/trigger.
--    Body recreated from 20260610000000_circle_field.sql (newest gen).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION after_circle_current_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE circles
  SET season_current = season_current + NEW.amount
  WHERE id = NEW.circle_id;

  RETURN NEW;
END;
$$;

-- Drop the old trigger (on the renamed table — DROP TRIGGER IF EXISTS is name-safe)
-- and the old function, then attach the canon trigger.
DROP TRIGGER IF EXISTS trg_after_circle_field_transaction   ON circle_current_transactions;
DROP TRIGGER IF EXISTS trg_after_circle_current_transaction ON circle_current_transactions;
DROP FUNCTION IF EXISTS after_circle_field_transaction();

CREATE TRIGGER trg_after_circle_current_transaction
  AFTER INSERT ON circle_current_transactions
  FOR EACH ROW
  EXECUTE FUNCTION after_circle_current_transaction();

-- ---------------------------------------------------------------------------
-- 4. Recreate the SELECT policy under the canon name (predicate identical).
-- ---------------------------------------------------------------------------
ALTER TABLE public.circle_current_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circle_field_transactions: members or public read"   ON circle_current_transactions;
DROP POLICY IF EXISTS "circle_current_transactions: members or public read" ON circle_current_transactions;
CREATE POLICY "circle_current_transactions: members or public read"
  ON circle_current_transactions FOR SELECT
  USING (
    circle_id = ANY (get_my_circle_ids())
    OR EXISTS (
      SELECT 1 FROM circles c
      WHERE c.id = circle_current_transactions.circle_id
        AND c.resonance_public = true
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Recreate reset_season() reading circles.season_current. Body is the
--    20260613000030_naming_canon_ranks version (renamed rank labels +
--    ZAP_TO_GEM_RATES note already applied); ONLY the circle-standing zeroing line
--    changes from current_season_field → season_current.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  active_season_num integer;
  r RECORD;
  conversion_rate numeric;
  converted integer;
  challenges_done integer;
begin
  select season_number into active_season_num from seasons where status = 'active' limit 1;
  if active_season_num is null then
    select coalesce(max(season), 0) + 1 into active_season_num from season_trophies;
  end if;

  for r in
    select id, current_season_rank, current_season_zaps, season_challenges_complete
    from profiles
    where current_season_zaps > 0
  loop
    -- ZAP_TO_GEM_RATES (provisional — pending economy tuning; see naming_canon_ranks).
    conversion_rate := case r.current_season_rank::text
      when 'luminary' then 1.0 / 1.5
      when 'conduit'  then 1.0 / 2.0
      when 'beacon'   then 1.0 / 3.0
      when 'signal'   then 1.0 / 4.0
      else                 1.0 / 5.0   -- ghost / echo
    end;

    converted := floor(r.current_season_zaps * conversion_rate);

    select count(*) into challenges_done
    from challenge_progress
    where profile_id = r.id and completed_at is not null;

    insert into season_trophies (profile_id, season, final_rank, final_zaps, gems_converted, challenges_completed)
    values (r.id, active_season_num, r.current_season_rank::text, r.current_season_zaps, converted, challenges_done)
    on conflict (profile_id, season) do nothing;

    if converted > 0 then
      insert into gem_transactions (profile_id, action_type, amount, metadata)
      values (r.id, 'season_convert', converted,
        jsonb_build_object('season', active_season_num, 'rank', r.current_season_rank::text, 'zaps', r.current_season_zaps));
    end if;
  end loop;

  -- Lock the lifetime peak before wiping the season (covers manual Luminary).
  update profiles
  set lifetime_rank = GREATEST(lifetime_rank, current_season_rank)
  where true;

  update profiles
  set current_season_zaps        = 0,
      current_season_rank        = 'ghost'::season_rank_enum,
      current_season_gems        = 0,
      season_challenges_complete = false
  where true;

  -- Circle Current is a per-season collective standing — zero it with the season
  -- (the circle_current_transactions ledger is permanent history and stays).
  update circles
  set season_current = 0
  where true;

  update streaks
  set current_count    = 0,
      last_activity_at = null,
      updated_at       = now()
  where true;

  delete from challenge_progress;

  -- Close the active season and open the next.
  update seasons set status = 'ended', ends_at = coalesce(ends_at, now())
  where status = 'active';
  insert into seasons (season_number, name, status, starts_at)
  values (active_season_num + 1, 'Season ' || (active_season_num + 1), 'active', now())
  on conflict (season_number) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Canonize the table comment.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.circle_current_transactions IS
  'Append-only Circle Current ledger (was circle_field_transactions; NAMING.md, ADR-208). One row per collective credit; the after_circle_current_transaction trigger is the SINGLE writer of circles.season_current. Service-role write only; collaborative, never an inter-circle ranking.';

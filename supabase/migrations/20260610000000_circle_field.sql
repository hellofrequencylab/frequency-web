-- =============================================================================
-- Circle Field — collective (NOT competitive) gamification (EVENTS-SYSTEM §6.2)
--
-- WHY: events already reward the individual at verified check-in (Zaps via
-- awardZapsForAction('event_attend')). Circle Field rolls a small, fixed credit
-- from each circle-scoped event up to the *circle itself*, so a circle accrues a
-- shared seasonal standing — "OUR circle gathered N Field this season". It is
-- deliberately collaborative: there is NO inter-circle ranking, and the standing
-- is private by default, surfacing publicly only when circles.resonance_public is
-- true (that column already exists — 20260609230000_events_p0_capacity_visibility).
-- Research backing: collective gamification sustains only when the shared goal +
-- teammates are visible, and competitive public leaderboards harm the lower-ranked
-- (EVENTS-SYSTEM §4, Law 2).
--
-- DESIGN: this mirrors the zaps ledger exactly (ADR-139,
-- 20260607040000_zap_ledger_and_recategorize). Every credit is ONE append-only
-- row in circle_field_transactions; an AFTER INSERT trigger is the SINGLE place
-- the running total (circles.current_season_field) moves — so the ledger and the
-- counter can never disagree, and there is one owner of the total. Award = ledger
-- insert (lib/events/circle-field.ts), never a direct column write.
--
-- RLS: service-role-write-only (RLS ON, NO insert/update policy — only the admin
-- client writes, same as zap_transactions / all ledger tables). SELECT is granted
-- to circle members (via the get_my_circle_ids() SECURITY-DEFINER helper) and,
-- when the circle has opted in (resonance_public = true), to anyone.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The running total on the circle. One trigger (below) owns this column;
--    nothing else writes it. Mirrors profiles.current_season_zaps.
-- ---------------------------------------------------------------------------

ALTER TABLE public.circles
  ADD COLUMN IF NOT EXISTS current_season_field integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.circles.current_season_field IS
  'Collective Circle Field standing for the active season (sum of circle_field_transactions.amount). Maintained solely by the after_circle_field_transaction trigger; zeroed by reset_season(). Collaborative, never an inter-circle ranking.';

-- ---------------------------------------------------------------------------
-- 2. Append-only Circle Field ledger (mirrors zap_transactions). event_id is
--    null-ok so non-event credits (future) stay possible; profile_id records WHO
--    contributed the credit (e.g. the member who checked in).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS circle_field_transactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id  uuid        NOT NULL REFERENCES circles  (id) ON DELETE CASCADE,
  event_id   uuid        REFERENCES events   (id) ON DELETE SET NULL,
  profile_id uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  amount     integer     NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circle_field_transactions_circle  ON circle_field_transactions (circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_field_transactions_event   ON circle_field_transactions (event_id);
CREATE INDEX IF NOT EXISTS idx_circle_field_transactions_created ON circle_field_transactions (created_at);

-- ---------------------------------------------------------------------------
-- 3. Trigger: a Circle Field transaction is the ONE place the circle's running
--    season total moves (exactly mirrors after_zap_transaction owning the profile
--    total). SECURITY DEFINER with a pinned search_path, same convention.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION after_circle_field_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE circles
  SET current_season_field = current_season_field + NEW.amount
  WHERE id = NEW.circle_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_circle_field_transaction ON circle_field_transactions;
CREATE TRIGGER trg_after_circle_field_transaction
  AFTER INSERT ON circle_field_transactions
  FOR EACH ROW
  EXECUTE FUNCTION after_circle_field_transaction();

-- ---------------------------------------------------------------------------
-- 4. RLS: service-role-write-only (RLS ON, NO insert/update policy — writes go
--    through the admin client, same as every ledger / money table). SELECT for
--    members of the circle, OR for anyone when the circle has opted into a public
--    standing (resonance_public = true). The ledger is a permanent history and is
--    intentionally NOT cleared at season end (same as zap_transactions); the
--    derived running total is what resets with the season (step 5).
-- ---------------------------------------------------------------------------

ALTER TABLE circle_field_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circle_field_transactions: members or public read" ON circle_field_transactions;
CREATE POLICY "circle_field_transactions: members or public read"
  ON circle_field_transactions FOR SELECT
  USING (
    circle_id = ANY (get_my_circle_ids())
    OR EXISTS (
      SELECT 1 FROM circles c
      WHERE c.id = circle_field_transactions.circle_id
        AND c.resonance_public = true
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Season rollover: the Circle Field standing is per-season, so zero it when
--    the season resets — exactly as reset_season() zeroes current_season_zaps.
--    Re-creates the current reset_season() (from 20260608060000_lifetime_rank)
--    verbatim, adding the circles.current_season_field reset. The ledger itself
--    is the lifetime "how the Field was built" record and is NOT cleared.
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
    conversion_rate := case r.current_season_rank::text
      when 'luminary'  then 1.0 / 1.5
      when 'conduit'   then 1.0 / 2.0
      when 'agent'     then 1.0 / 3.0
      when 'operative' then 1.0 / 4.0
      else                  1.0 / 5.0
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

  -- Circle Field is a per-season collective standing — zero it with the season
  -- (the circle_field_transactions ledger is permanent history and stays).
  update circles
  set current_season_field = 0
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

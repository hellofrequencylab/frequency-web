-- =============================================================================
-- Rewards Economy v2 + Amplitude + Season 1 awards (build brief, June 2026)
--
-- Supersedes the provisional economy items flagged in docs/GAMIFICATION-AUDIT.md.
-- Companion ADR in docs/DECISIONS.md (supersedes ADR-037 lifetime-rank DISPLAY and
-- retires the Gem tiers; the lifetime_rank COLUMN + ratchet stay — the retro
-- reward rule `seasoned_agent` reads it).
--
-- WHAT (in apply order):
--   1. practices.weight_class light|standard|heavy — drives the per-log Zap payout
--      (8/12/15). Backfilled from the deprecated reward_zaps override; weight_class
--      is now the ONLY payout driver for plain logs (journey-item overrides remain).
--   2. profiles.amplitude — lifetime XP. amplitude = lifetime cumulative Zaps, with
--      hosting-class actions counting 2×. Never decremented, never spent.
--   3. after_zap_transaction(): accrues amplitude in the same single place totals
--      move. after_crew_completion(): RE-FIXED to route through the ledger — the
--      20260613000030 naming migration accidentally restored the pre-ADR-139 body
--      (direct profile writes), so crew-task zaps were bypassing the ledger again.
--   4. Amplitude backfill: profiles.lifetime_zaps (complete, includes pre-ledger
--      history) + 1× extra for hosting-class LEDGER rows (the 2× bonus is only
--      provable for ledger-era grants; pre-ledger hosting acts count 1×).
--   5. witnessed_grants — peer-granted awards (carried_the_room / strong_signal).
--   6. practice_streaks — per-practice consistency + depth cache (truth derives
--      from practice_logs; the nightly job maintains it).
--   7. nodes.city — admin-entered city for the long_range secret award (no
--      reverse-geocoding in the stack; locations stay server-only).
--   8. store_items.season_id / expires_at — season-scoped + retiring SKUs.
--   9. season_challenges.is_active — archive (never delete) challenge rows.
--  10. reset_season() v2: flat 5:1 conversion + one-time final-rank Gem bonus
--      (idempotent via reward_grants), season trophy for every profile with ≥1
--      practice log OR season zaps, Founding Season stamp (Season 1 only).
--  11. zap_config rows for the new tunables (weight classes, Co-op Pulse,
--      Welcome Back, Full Cycle).
--  12. Seeds: S1 challenge re-seed (15-template; purse of the 14 non-Completionist
--      challenges = 1,000⚡, inside the 950–1,050 band; Completionist +250 on top),
--      the 5 secret "Quiet Ones" achievements, 2 Amplitude milestone awards
--      (1k / 5k; later milestones stubbed for S2+), S1 Vault Store SKUs, and
--      granted-only rank/journey/circle cosmetics (gem_cost 0, is_active=false —
--      ownership arrives via store_redemptions, never purchasable).
--
-- RLS: new tables get read policies below; writes stay service-role (repo norm).
-- NOTE: regenerate lib/database.types.ts after apply.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Practice weight classes (payout driver; replaces the reward_zaps override)
-- ---------------------------------------------------------------------------
ALTER TABLE practices ADD COLUMN IF NOT EXISTS weight_class text NOT NULL DEFAULT 'standard'
  CHECK (weight_class IN ('light','standard','heavy'));

-- Backfill from the deprecated per-practice override: <=10 → light, 11–13 →
-- standard, >=14 → heavy. reward_zaps is kept for history but no longer read.
UPDATE practices SET weight_class = CASE
  WHEN reward_zaps IS NULL      THEN 'standard'
  WHEN reward_zaps <= 10        THEN 'light'
  WHEN reward_zaps >= 14        THEN 'heavy'
  ELSE 'standard'
END
WHERE weight_class = 'standard';

COMMENT ON COLUMN practices.weight_class IS
  'Drives the per-log Zap payout (zap_config practice_logged_light/standard/heavy = 8/12/15). A property of the PRACTICE, not the member''s Initiate/Adept/Master depth tier (which never changes zap math). Supersedes reward_zaps (deprecated, kept for history).';
COMMENT ON COLUMN practices.reward_zaps IS
  'DEPRECATED (Rewards Economy v2): no longer read by the log path. weight_class drives the payout. Kept for history only.';

-- practices_ranked is a frozen-column view (`p.*` expands at creation — see
-- 20260606160000): rebuild it so weight_class is exposed to the library reads.
DROP VIEW IF EXISTS practices_ranked;
CREATE VIEW practices_ranked
  WITH (security_invoker = true) AS
SELECT
  p.*,
  coalesce(a.adopters, 0)   AS adopters,
  coalesce(l.logs_30d, 0)   AS logs_30d,
  coalesce(l.logs_total, 0) AS logs_total,
  (coalesce(l.logs_30d, 0) * 3
   + coalesce(a.adopters, 0) * 2
   + coalesce(l.logs_total, 0)) AS score
FROM practices p
LEFT JOIN (
  SELECT practice_id, count(*) AS adopters
  FROM member_practices WHERE active = true
  GROUP BY practice_id
) a ON a.practice_id = p.id
LEFT JOIN (
  SELECT practice_id,
         count(*) FILTER (WHERE logged_for >= current_date - 30) AS logs_30d,
         count(*) AS logs_total
  FROM practice_logs
  GROUP BY practice_id
) l ON l.practice_id = p.id;

REVOKE ALL ON practices_ranked FROM anon, authenticated;
GRANT SELECT ON practices_ranked TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Amplitude — the lifetime layer
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS amplitude bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.amplitude IS
  'Lifetime XP: cumulative Zaps ever earned, hosting-class actions (event_host, program_run, circle_start, circle_activate) counting 2×. Accrued ONLY by after_zap_transaction(). Never decremented, never spent, never gates anything (cosmetic continuity aside). Level derived on read: largest L where 50*L*(L+1) <= amplitude (lib/amplitude.ts).';

-- ---------------------------------------------------------------------------
-- 3a. after_zap_transaction() v4 — newest gen 20260613000030_naming_canon_ranks
--     + ONE change: amplitude accrual in the same totals UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION after_zap_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_zaps integer;
BEGIN
  UPDATE profiles
  SET current_season_zaps = current_season_zaps + NEW.amount,
      lifetime_zaps       = lifetime_zaps + NEW.amount,
      amplitude           = amplitude + (NEW.amount::bigint *
        CASE WHEN NEW.action_type IN ('event_host','program_run','circle_start','circle_activate')
             THEN 2 ELSE 1 END)
  WHERE id = NEW.profile_id
  RETURNING current_season_zaps INTO new_zaps;

  UPDATE profiles
  SET current_season_rank = CASE
    WHEN new_zaps >= 1500
         AND current_season_rank NOT IN ('conduit', 'luminary')
         THEN 'conduit'::season_rank_enum
    WHEN new_zaps >= 750
         AND current_season_rank NOT IN ('beacon', 'conduit', 'luminary')
         THEN 'beacon'::season_rank_enum
    WHEN new_zaps >= 300
         AND current_season_rank NOT IN ('signal', 'beacon', 'conduit', 'luminary')
         THEN 'signal'::season_rank_enum
    WHEN new_zaps >= 100
         AND current_season_rank NOT IN ('echo', 'signal', 'beacon', 'conduit', 'luminary')
         THEN 'echo'::season_rank_enum
    ELSE current_season_rank
  END
  WHERE id = NEW.profile_id;

  -- Lock the lifetime peak (monotonic — GREATEST never lowers it). The column
  -- stays: the retro rule `seasoned_agent` (lib/rewards/rules.ts) reads it even
  -- though Amplitude supersedes it as the member-facing lifetime layer.
  UPDATE profiles
  SET lifetime_rank = GREATEST(lifetime_rank, current_season_rank)
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3b. after_crew_completion() — REGRESSION FIX. Newest gen is the ledger-routing
--     body from 20260607040000 (ADR-139), NOT the 20240118 body the naming
--     migration restored. Crew-task zaps must flow through zap_transactions so
--     the Vault log AND amplitude see them. Byte-identical to 20260607040000 §3.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION after_crew_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.zaps_earned, 0) > 0 THEN
    INSERT INTO zap_transactions (profile_id, action_type, amount, metadata)
    VALUES (NEW.profile_id, 'crew_task', NEW.zaps_earned,
            jsonb_build_object('task_id', NEW.task_id));
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Amplitude backfill (one-time; before any UI exposure).
--    lifetime_zaps already contains EVERY zap ever granted (pre-ledger writes
--    included), at 1×. Hosting-class ledger rows add their provable extra 1×.
--    Guarded to profiles still at 0 so re-runs never double-count.
-- ---------------------------------------------------------------------------
UPDATE profiles p
SET amplitude = p.lifetime_zaps::bigint + COALESCE((
  SELECT SUM(z.amount)::bigint
  FROM zap_transactions z
  WHERE z.profile_id = p.id
    AND z.action_type IN ('event_host','program_run','circle_start','circle_activate')
), 0)
WHERE p.amplitude = 0 AND p.lifetime_zaps > 0;

-- ---------------------------------------------------------------------------
-- 5. Witnessed grants — peer-granted awards (Season 1: carried_the_room by a
--    circle Host to a member of their circle; strong_signal by any member).
--    One grant per granter per (season, award) — the UNIQUE is the rule.
--    App-level authz (host-of-circle / not-self) lives in lib/awards/witnessed.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS witnessed_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season      integer NOT NULL,
  award_slug  text NOT NULL CHECK (award_slug IN ('carried_the_room','strong_signal')),
  granted_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_to  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, award_slug, granted_by)
);
CREATE INDEX IF NOT EXISTS idx_witnessed_grants_to ON witnessed_grants (granted_to);

ALTER TABLE witnessed_grants ENABLE ROW LEVEL SECURITY;
-- Public read: the Award displays the granted-by name. Writes are service-role.
DROP POLICY IF EXISTS "witnessed_grants: public read" ON witnessed_grants;
CREATE POLICY "witnessed_grants: public read" ON witnessed_grants FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- 6. Per-practice streak state (cache; truth derives from practice_logs).
--    best_on_track_weeks is added beyond the brief's shape: the Shelf shows the
--    HIGHEST tier reached, which a reset-to-0 current count can't express.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS practice_streaks (
  profile_id                uuid NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  practice_id               uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  consecutive_on_track_weeks integer NOT NULL DEFAULT 0,
  best_on_track_weeks       integer NOT NULL DEFAULT 0,
  lifetime_logs             integer NOT NULL DEFAULT 0,
  full_cycle_paid           boolean NOT NULL DEFAULT false,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, practice_id)
);
CREATE INDEX IF NOT EXISTS idx_practice_streaks_profile ON practice_streaks (profile_id, lifetime_logs DESC);

ALTER TABLE practice_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "practice_streaks: read own" ON practice_streaks;
CREATE POLICY "practice_streaks: read own" ON practice_streaks FOR SELECT USING (
  profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 7. Node city — for the long_range secret award (3 distinct cities). Admin-
--    entered at node creation; node coordinates stay server-only (anti-cheat).
-- ---------------------------------------------------------------------------
ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS city text;

-- ---------------------------------------------------------------------------
-- 8. Store: season scoping + retirement.
-- ---------------------------------------------------------------------------
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS season_id integer;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS expires_at timestamptz;
COMMENT ON COLUMN store_items.season_id IS
  'Season-exclusive SKU: stops selling at that season''s close (lib enforces). Null = evergreen.';
COMMENT ON COLUMN store_items.expires_at IS
  'Hard sale cutoff (e.g. the Every Frequency border retires at season end). Null = no cutoff.';

-- ---------------------------------------------------------------------------
-- 9. Challenges: archive flag (never delete — progress rows reference them).
-- ---------------------------------------------------------------------------
ALTER TABLE season_challenges ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 10. reset_season() v2 — conversion rewrite. Newest gen is
--     20260613000040_naming_canon_circle_current; body carried verbatim except:
--       * flat 5:1 conversion (floor) replaces the rank-based sliding ladder
--       * one-time final-rank Gem bonus (echo 10 / signal 25 / beacon 50 /
--         conduit 100 / luminary 250), idempotent via reward_grants
--       * conversion itself is now also idempotent via reward_grants
--       * trophy minted for every profile with ≥1 practice log this season OR
--         season zaps > 0 (was: zaps > 0 only)
--       * Founding Season stamp: Season 1 close grants the existing manual
--         'season-one' achievement to everyone who practiced
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  active_season_num integer;
  season_start timestamptz;
  r RECORD;
  converted integer;
  rank_bonus integer;
  challenges_done integer;
begin
  select season_number, starts_at into active_season_num, season_start
  from seasons where status = 'active' limit 1;
  if active_season_num is null then
    select coalesce(max(season), 0) + 1 into active_season_num from season_trophies;
  end if;
  if season_start is null then
    season_start := now() - interval '13 weeks';
  end if;

  for r in
    select p.id, p.current_season_rank, p.current_season_zaps, p.season_challenges_complete,
           exists (select 1 from practice_logs pl
                   where pl.profile_id = p.id and pl.created_at >= season_start) as practiced
    from profiles p
    where p.current_season_zaps > 0
       or exists (select 1 from practice_logs pl
                  where pl.profile_id = p.id and pl.created_at >= season_start)
  loop
    -- ZAP_TO_GEM_RATIO (Rewards Economy v2): flat 5:1 for everyone, floor division.
    converted := floor(r.current_season_zaps / 5.0);

    -- RANK_BONUS_GEMS: one-time, by final season rank.
    rank_bonus := case r.current_season_rank::text
      when 'luminary' then 250
      when 'conduit'  then 100
      when 'beacon'   then 50
      when 'signal'   then 25
      when 'echo'     then 10
      else                 0
    end;

    select count(*) into challenges_done
    from challenge_progress
    where profile_id = r.id and completed_at is not null;

    -- Season trophy (final rank + season Zaps stamped) for everyone who played.
    insert into season_trophies (profile_id, season, final_rank, final_zaps, gems_converted, challenges_completed)
    values (r.id, active_season_num, r.current_season_rank::text, r.current_season_zaps, converted, challenges_done)
    on conflict (profile_id, season) do nothing;

    -- Conversion, claim-then-pay (reward_grants is the idempotency backstop, ADR-168).
    if converted > 0 then
      begin
        insert into reward_grants (rule_key, profile_id, reward_kind, amount, detail)
        values ('season:' || active_season_num || ':convert', r.id, 'gems', converted,
                'Season ' || active_season_num || ' Zap conversion (5:1)');
        insert into gem_transactions (profile_id, action_type, amount, metadata)
        values (r.id, 'season_convert', converted,
          jsonb_build_object('season', active_season_num, 'rank', r.current_season_rank::text,
                             'zaps', r.current_season_zaps, 'rate', '5:1'));
      exception when unique_violation then null;
      end;
    end if;

    -- Final-rank bonus, claim-then-pay.
    if rank_bonus > 0 then
      begin
        insert into reward_grants (rule_key, profile_id, reward_kind, amount, detail)
        values ('season:' || active_season_num || ':rank_bonus', r.id, 'gems', rank_bonus,
                'Season ' || active_season_num || ' final-rank bonus — ' || r.current_season_rank::text);
        insert into gem_transactions (profile_id, action_type, amount, metadata)
        values (r.id, 'season_convert', rank_bonus,
          jsonb_build_object('season', active_season_num, 'kind', 'rank_bonus',
                             'rank', r.current_season_rank::text));
      exception when unique_violation then null;
      end;
    end if;

    -- Founding Season stamp (Season 1 only): the manual 'season-one' achievement.
    if active_season_num = 1 and r.practiced then
      insert into user_achievements (profile_id, achievement_id)
      select r.id, a.id from achievements a where a.slug = 'season-one'
      on conflict do nothing;
    end if;
  end loop;

  -- Lock the lifetime peak before wiping the season (covers manual Luminary).
  update profiles
  set lifetime_rank = GREATEST(lifetime_rank, current_season_rank)
  where true;

  -- Amplitude, Gems, Awards, trophies, Practice Shelf untouched — only season
  -- counters zero.
  update profiles
  set current_season_zaps        = 0,
      current_season_rank        = 'ghost'::season_rank_enum,
      current_season_gems        = 0,
      season_challenges_complete = false
  where true;

  -- Circle Current is per-season (the ledger is permanent history and stays).
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
-- 11. Tunable config rows (live-editable on /admin/gamification). DO NOTHING on
--     conflict so operator tuning is never clobbered by a re-run.
-- ---------------------------------------------------------------------------
INSERT INTO zap_config (action_type, zaps_amount, daily_cap, is_active, description) VALUES
  ('practice_logged_light',  8, NULL, true, 'Logged a light-weight practice (weight_class = light).'),
  ('practice_logged_heavy', 15, NULL, true, 'Logged a heavy-weight practice (weight_class = heavy).'),
  ('co_op_pulse',            3, NULL, true, 'Co-op Pulse: 3+ circle members logged the same adopted Journey the same day (nightly; once per member/journey/day).'),
  ('welcome_back',          10, NULL, true, 'Welcome Back: first practice log after a 7+ day gap (once per gap).'),
  ('practice_full_cycle',   50, NULL, true, 'Full Cycle: 13 consecutive on-track weeks on one practice (one-time per practice).')
ON CONFLICT (action_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 12a. Season 1 challenge re-seed → the 15-template.
--      Purse rule: the 14 non-Completionist challenges total exactly 1,000⚡
--      (4×25 + 5×50 + 4×100 + 250) — inside the 950–1,050 band. The Completionist
--      (250⚡) pays ON TOP of the purse; including it would make the band
--      arithmetically unreachable (minimum 1,060), so the purse excludes it.
--      Existing slugs are reused so challenge_progress rows survive; everything
--      else from the old 39 is archived (is_active = false), never deleted.
-- ---------------------------------------------------------------------------
UPDATE season_challenges SET is_active = false WHERE season = 1;

INSERT INTO season_challenges (season, slug, name, description, category, difficulty, criteria, target, zaps_reward, sort_order, is_active) VALUES
  -- Easy — 4 × 25⚡
  (1, 'attend-3-events',  'Show Up',          'Attend 3 events this season.',                       'events',  'easy',      '{"type":"event_attend"}',                          3,    25,  1, true),
  (1, 'make-5-posts',     'Find Your Voice',  'Share 5 posts with the community.',                  'content', 'easy',      '{"type":"post_create"}',                           5,    25,  2, true),
  (1, 'earn-100-zaps',    'First Hundred',    'Earn your first 100 Zaps this season.',              'seasonal','easy',      '{"type":"season_zaps"}',                           100,  25,  3, true),
  (1, '2-week-streak',    'Warm Up',          'Keep a 2-week attendance streak.',                   'streak',  'easy',      '{"type":"streak","streak_type":"attendance"}',     2,    25,  4, true),
  -- Normal — 5 × 50⚡
  (1, 'attend-8-events',  'Committed',        'Attend 8 events this season.',                       'events',  'normal',    '{"type":"event_attend"}',                          8,    50,  5, true),
  (1, 'earn-500-zaps',    'Zap Collector',    'Earn 500 Zaps this season.',                         'seasonal','normal',    '{"type":"season_zaps"}',                           500,  50,  6, true),
  (1, 'refer-1-member',   'Bring a Friend',   'Refer someone who joins and shows up.',              'social',  'normal',    '{"type":"referral"}',                              1,    50,  7, true),
  (1, '4-week-streak',    'Momentum',         'Keep a 4-week attendance streak.',                   'streak',  'normal',    '{"type":"streak","streak_type":"attendance"}',     4,    50,  8, true),
  (1, 'make-15-posts',    'Signal Boost',     'Share 15 posts with the community.',                 'content', 'normal',    '{"type":"post_create"}',                           15,   50,  9, true),
  -- Hard — 4 × 100⚡
  (1, 'host-3-events',    'Event Captain',    'Host 3 events this season.',                         'leadership','hard',    '{"type":"event_host"}',                            3,    100, 10, true),
  (1, 'earn-1500-zaps',   'Power Up',         'Earn 1,500 Zaps this season.',                       'seasonal','hard',      '{"type":"season_zaps"}',                           1500, 100, 11, true),
  (1, '8-week-streak',    'Iron Will',        'Keep an 8-week attendance streak.',                  'streak',  'hard',      '{"type":"streak","streak_type":"attendance"}',     8,    100, 12, true),
  (1, 'attend-20-events', 'Ever Present',     'Attend 20 events this season.',                      'events',  'hard',      '{"type":"event_attend"}',                          20,   100, 13, true),
  -- Legendary — 2
  (1, 'reach-conduit',    'Conduit Ascension','Reach Conduit rank this season.',                    'seasonal','legendary', '{"type":"rank_reached","rank":"conduit"}',         1,    250, 14, true),
  (1, 'complete-all-challenges', 'The Completionist', 'Complete all 14 other Season 1 challenges.', 'special', 'legendary', '{"type":"all_challenges"}',                        14,   250, 15, true)
ON CONFLICT (season, slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  difficulty  = EXCLUDED.difficulty,
  criteria    = EXCLUDED.criteria,
  target      = EXCLUDED.target,
  zaps_reward = EXCLUDED.zaps_reward,
  sort_order  = EXCLUDED.sort_order,
  is_active   = true;

-- ---------------------------------------------------------------------------
-- 12b. The Quiet Ones — 5 secret awards (hidden until earned; badge-only, 0⚡).
--      Evaluated by lib/awards/secret.ts, not the generic criteria engine
--      (each needs its own query). Unknown criteria types are safely ignored
--      by the generic engine (default: false).
-- ---------------------------------------------------------------------------
INSERT INTO achievements (slug, name, description, icon, category, tier, criteria, zaps_reward, is_secret, sort_order) VALUES
  ('dawn-patrol',   'Dawn Patrol',   'Logged 10 practices before 6am.',                              'sunrise',    'special', 'gold',     '{"type":"dawn_patrol","count":10}',   0, true, 90),
  ('radio-silence', 'Radio Silence', 'Completed 3 Screen-Free day practices.',                       'radio',      'special', 'gold',     '{"type":"radio_silence","count":3}',  0, true, 91),
  ('four-pillars',  'Four Pillars',  'Logged a practice in all four Pillars within one week.',       'columns-3',  'special', 'gold',     '{"type":"four_pillars"}',             0, true, 92),
  ('carrier-wave',  'Carrier Wave',  'Shared 10 Co-op Pulse days with your circle.',                 'waves',      'special', 'platinum', '{"type":"carrier_wave","count":10}',  0, true, 93),
  ('long-range',    'Long Range',    'Captured nodes in 3 different cities.',                        'map-pin',    'special', 'platinum', '{"type":"long_range","count":3}',     0, true, 94)
ON CONFLICT (slug) DO NOTHING;

-- Amplitude milestone Awards — minted permanent. Only 1k + 5k ship with S1 art;
-- the later milestones (10k/25k/50k/100k) are seeded when their art lands.
INSERT INTO achievements (slug, name, description, icon, category, tier, criteria, zaps_reward, is_secret, sort_order) VALUES
  ('amplitude-1k', 'First Thousand', 'Reached 1,000 lifetime Amplitude.', 'audio-waveform', 'special', 'gold',     '{"type":"amplitude","count":1000}', 0, false, 95),
  ('amplitude-5k', 'Five K',         'Reached 5,000 lifetime Amplitude.', 'audio-waveform', 'special', 'platinum', '{"type":"amplitude","count":5000}', 0, false, 96)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 12c. Season 1 Vault Store SKUs (Gems). season_id = 1 items stop selling at
--      season close; metadata carries machine flags (requires_rank, forge_claim,
--      s1_exclusive). DO NOTHING so live price tuning is never clobbered.
-- ---------------------------------------------------------------------------
INSERT INTO store_items (slug, name, description, category, gem_cost, icon, metadata, stock, is_active, sort_order, season_id) VALUES
  ('s1-flair-set',        'S1 Flair Set',             'A set of Season 1 profile flair icons.',                                'cosmetic',    50,  'sparkles',   '{}',                              NULL, true, 10, 1),
  ('s1-emote-pack',       'Emote Pack 01',            'The first Frequency emote pack.',                                       'feature',     60,  'smile',      '{}',                              NULL, true, 11, NULL),
  ('early-registration',  'Early Registration',       'A head-start window to register for high-demand events.',               'feature',     75,  'clock',      '{}',                              NULL, true, 12, NULL),
  ('season-zero',         'Season Zero',              'A collectible mark from before the game began.',                        'collectible', 100, 'gem',        '{"s1_exclusive":true}',           NULL, true, 13, 1),
  ('waveform-border',     'Waveform Border',          'An animated waveform profile border. Retires at season close.',         'cosmetic',    150, 'activity',   '{"s1_exclusive":true}',           NULL, true, 14, 1),
  ('guest-pass',          'Guest Pass',               'Bring a guest to a members-only event.',                                'membership',  150, 'ticket',     '{}',                              NULL, true, 15, NULL),
  ('custom-title-slot',   'Custom Title Slot',        'Unlock a custom title on your profile.',                                'title',       200, 'type',       '{}',                              NULL, true, 16, NULL),
  ('listening-room-seat', 'Listening Room Seat',      'A seat at the Season 1 Listening Room session. 12 seats.',              'feature',     250, 'headphones', '{"s1_exclusive":true}',           12,   true, 17, 1),
  ('animated-banner',     'Animated Banner',          'An animated profile banner.',                                           'cosmetic',    250, 'image',      '{}',                              NULL, true, 18, NULL),
  ('callsign-plate',      'Callsign Plate',           'A custom callsign plate on your profile.',                              'cosmetic',    300, 'badge',      '{}',                              NULL, true, 19, NULL),
  ('name-a-node',         'Name a Node',              'Put your name on a physical node in the field.',                        'feature',     300, 'map-pin',    '{}',                              NULL, true, 20, NULL),
  ('pitch-a-journey',     'Pitch a Journey',          'Pitch an official Journey for a future season.',                        'feature',     400, 'compass',    '{}',                              NULL, true, 21, NULL),
  ('founders-table-seat', 'Founders'' Table Seat',    'A seat at the Founders'' Table dinner. Conduit rank or above.',         'feature',     500, 'crown',      '{"requires_rank":"conduit","s1_exclusive":true}', NULL, true, 22, 1)
ON CONFLICT (slug) DO NOTHING;

-- Granted-only awards/cosmetics (never purchasable: gem_cost 0, is_active false —
-- ownership arrives via store_redemptions from the award paths).
INSERT INTO store_items (slug, name, description, category, gem_cost, icon, metadata, is_active, sort_order, season_id) VALUES
  ('rank-ghost-flair',        'Static Fuzz',            'Ghost rank flair.',                                          'cosmetic',    0, 'ghost',      '{"granted":true,"rank":"ghost"}',                       false, 50, NULL),
  ('rank-echo-badge',         'Echo Badge',             'Echo rank badge + color accent.',                            'cosmetic',    0, 'audio-lines','{"granted":true,"rank":"echo"}',                        false, 51, NULL),
  ('rank-signal-ring',        'Clear Signal',           'Signal rank badge + animated ring.',                         'cosmetic',    0, 'radius',     '{"granted":true,"rank":"signal"}',                      false, 52, NULL),
  ('rank-beacon-token',       'Signal Token',           'Beacon rank digital 3D collectible.',                        'collectible', 0, 'radio-tower','{"granted":true,"rank":"beacon","forge_claim":true}',   false, 53, NULL),
  ('rank-conduit-gold-name',  'Gold Name',              'Conduit rank gold name treatment (season-scoped).',          'cosmetic',    0, 'crown',      '{"granted":true,"rank":"conduit","season_scoped":true}',false, 54, 1),
  ('rank-luminary-token',     'Black Token',            'Luminary digital collectible.',                              'collectible', 0, 'moon-star',  '{"granted":true,"rank":"luminary","forge_claim":true}', false, 55, NULL),
  ('luminary-club-mark',      'Luminary Club',          'Permanent Luminary Club mark.',                              'cosmetic',    0, 'star',       '{"granted":true,"rank":"luminary"}',                    false, 56, NULL),
  ('journey-badge-mind',      'Tuned In',               'Completed the Mind Journey.',                                'collectible', 0, 'brain',      '{"granted":true,"pillar":"mind"}',                      false, 60, 1),
  ('journey-badge-body',      'Grounded Green',         'Completed the Body Journey.',                                'collectible', 0, 'leaf',       '{"granted":true,"pillar":"body"}',                      false, 61, 1),
  ('journey-badge-spirit',    'Connection Spark',       'Completed the Spirit Journey.',                              'collectible', 0, 'flame',      '{"granted":true,"pillar":"spirit"}',                    false, 62, 1),
  ('journey-badge-expression','Broadcast Wave',         'Completed the Expression Journey.',                          'collectible', 0, 'megaphone',  '{"granted":true,"pillar":"expression"}',                false, 63, 1),
  ('full-spectrum-banner',    'Full Spectrum',          'All four Pillar Journeys in one season. S1-exclusive.',      'cosmetic',    0, 'rainbow',    '{"granted":true,"s1_exclusive":true}',                  false, 64, 1),
  ('every-frequency-border',  'Every Frequency',        'Prismatic border for completing every Season 1 challenge.', 'cosmetic',    0, 'aperture',   '{"granted":true,"s1_exclusive":true}',                  false, 65, 1),
  ('circle-current-banner',   'Circle Current Banner',  'Your circle completed a shared challenge. Season-scoped.',  'cosmetic',    0, 'users',      '{"granted":true,"season_scoped":true}',                 false, 66, 1),
  ('coop-synchrony-badge',    'Co-op Synchrony',        'Your circle logged 30 Co-op Pulse days. Permanent.',        'collectible', 0, 'orbit',      '{"granted":true}',                                      false, 67, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 13. Circle-level awards (Circle Current banner / Co-op Synchrony) — the badge
--     belongs to the CIRCLE; member flair rides store_redemptions grants.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circle_awards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id  uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  award_slug text NOT NULL,
  season     integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (circle_id, award_slug)
);

ALTER TABLE circle_awards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "circle_awards: public read" ON circle_awards;
CREATE POLICY "circle_awards: public read" ON circle_awards FOR SELECT USING (true);

-- =============================================================================
-- ADR-232: joining pays — initial Zaps for every member, a bonus when you
-- arrive through a friend's link, and a join line for everyone.
--
-- The owner's call: "People should receive initial zaps for joining the
-- community. They should also get bonus zaps for joining through a friend's
-- link. Re work all member zap counts and announcements."
--
--   1. Two tunable zap_config rows: community_join (10⚡, paid to every new
--      member at onboarding) and referred_join_bonus (15⚡ ON TOP for the
--      newcomer when referred_by_profile_id is set — the INVITER's 40⚡
--      invite_accepted stays as-is, so a friend-link join moves 65⚡ total).
--      Live grants happen in lib/onboarding/welcome.ts grantJoinZaps()
--      (claim-then-pay via reward_grants: rule keys join.welcome /
--      join.referred), called from both onboarding paths.
--   2. Backfill: every ACTIVE, real (non-system, non-demo) member is granted
--      retroactively through the same reward_grants idempotency + the real
--      zap_transactions ledger (the after_zap_transaction trigger moves season
--      totals + Amplitude, so "all member zap counts" rework themselves).
--   3. Announcements: members who never got a join line receive one, authored
--      by Vera and BACKDATED to their profile's created_at so the lines fall
--      into feed history where they belong (the SystemLine renderer shows
--      live counts, so these immediately reflect the new grants).
-- =============================================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── 1. Tunable amounts ────────────────────────────────────────────────────────

INSERT INTO zap_config (action_type, zaps_amount, is_active, description)
SELECT 'community_join', 10, true, 'Joining the community (ADR-232)'
WHERE NOT EXISTS (SELECT 1 FROM zap_config WHERE action_type = 'community_join');

INSERT INTO zap_config (action_type, zaps_amount, is_active, description)
SELECT 'referred_join_bonus', 15, true, 'Newcomer bonus for joining through a friend''s link (ADR-232)'
WHERE NOT EXISTS (SELECT 1 FROM zap_config WHERE action_type = 'referred_join_bonus');

-- ── 2. Backfill the grants (claim-then-pay, exactly once per member) ─────────

WITH members AS (
  SELECT id FROM profiles
  WHERE is_active = true AND is_system = false AND COALESCE(is_demo, false) = false
), claimed AS (
  INSERT INTO reward_grants (rule_key, profile_id, reward_kind, amount, detail)
  SELECT 'join.welcome', m.id, 'zaps', 0, 'Joined the community'
  FROM members m
  WHERE NOT EXISTS (
    SELECT 1 FROM reward_grants g WHERE g.rule_key = 'join.welcome' AND g.profile_id = m.id
  )
  RETURNING profile_id
)
INSERT INTO zap_transactions (profile_id, action_type, amount, metadata)
SELECT profile_id, 'community_join',
       (SELECT zaps_amount FROM zap_config WHERE action_type = 'community_join'),
       jsonb_build_object('backfill', 'ADR-232')
FROM claimed;

WITH referred AS (
  SELECT id FROM profiles
  WHERE is_active = true AND is_system = false AND COALESCE(is_demo, false) = false
    AND referred_by_profile_id IS NOT NULL
), claimed AS (
  INSERT INTO reward_grants (rule_key, profile_id, reward_kind, amount, detail)
  SELECT 'join.referred', r.id, 'zaps', 0, 'Joined through a friend'
  FROM referred r
  WHERE NOT EXISTS (
    SELECT 1 FROM reward_grants g WHERE g.rule_key = 'join.referred' AND g.profile_id = r.id
  )
  RETURNING profile_id
)
INSERT INTO zap_transactions (profile_id, action_type, amount, metadata)
SELECT profile_id, 'referred_join_bonus',
       (SELECT zaps_amount FROM zap_config WHERE action_type = 'referred_join_bonus'),
       jsonb_build_object('backfill', 'ADR-232')
FROM claimed;

-- ── 3. A join line for everyone who never got one, backdated to their join ───

INSERT INTO posts (author_id, scope_id, visibility, post_type, body, created_at)
SELECT v.id, v.id, 'public', 'system',
       '@' || p.handle
         || CASE WHEN r.handle IS NOT NULL
                 THEN ' joined through @' || r.handle
                 ELSE ' joined the community' END
         || ' 👋',
       p.created_at
FROM profiles p
CROSS JOIN (SELECT id FROM profiles WHERE is_system = true AND is_active = true LIMIT 1) v
LEFT JOIN profiles r ON r.id = p.referred_by_profile_id
WHERE p.is_active = true AND p.is_system = false AND COALESCE(p.is_demo, false) = false
  AND p.handle IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM posts po
    WHERE po.post_type = 'system' AND po.body LIKE '@' || p.handle || ' joined%'
  );

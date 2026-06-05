-- Economy re-strategy (ADR-104). Confirms + rebalances the two-currency model:
--   GEMS  — on-platform / web engagement (spendable in the Vault). Daily-capped so
--           it can't be farmed; small per-action, accumulates to a stash.
--   ZAPS  — in-person + outreach (the season RANK ladder; "the weight of being
--           there"). Bigger, fewer; the biggest rewards live off the screen.
--
-- Tuned so a ~13-week reference season lands a casual member at Operative (300+),
-- a regular at Agent (750+), and a real leader at Conduit→Luminary (1500–3000) —
-- against the rank thresholds in lib/season-ranks.ts. Idempotent upserts; the live
-- amounts are these config rows (code fallbacks in lib/zaps.ts mirror the zaps).

-- ── ZAPS — in-person + outreach (drives season rank) ────────────────────────
insert into public.zap_config (action_type, zaps_amount, is_active, description) values
  ('circle_start',     100, true, 'Founded a real circle — the rarest, highest act of leadership.'),
  ('event_host',        60, true, 'Hosted an in-person event — you held the room.'),
  ('circle_activate',   40, true, 'Claimed/activated a circle so it stands on its own.'),
  ('invite_accepted',   40, true, 'Someone you brought in actually joined — outreach that lands.'),
  ('event_attend',      25, true, 'Showed up (verified check-in) — the core repeatable act.'),
  ('outreach_task',     20, true, 'Completed an outreach task (poster, flyer, QR drop).'),
  ('practice_logged',   12, true, 'Logged a real-world practice — the daily habit that builds a life.'),
  ('node_capture',      10, true, 'Captured a ghost node / code out in the world.')
on conflict (action_type) do update
  set zaps_amount = excluded.zaps_amount,
      is_active   = excluded.is_active,
      description = excluded.description;

-- ── GEMS — on-platform / web care (spendable in the Vault) ───────────────────
insert into public.gem_config (action_type, gems_amount, daily_cap, is_active, description) values
  ('quest_complete',     30, null, true, 'Finished a multi-step Arc.'),
  ('challenge_complete',  15, null, true, 'Completed a season challenge.'),
  ('welcome_member',       8, null, true, 'Welcomed a newcomer — the warmest on-platform act.'),
  ('event_rsvp',           5, null, true, 'RSVP''d to an event (committing online to show up).'),
  ('circle_join',          5, null, true, 'Joined a circle.'),
  ('post_create',          3,    3, true, 'Shared a post (up to 3/day).'),
  ('comment_reply',        2,    5, true, 'Replied in a thread (up to 5/day).'),
  ('daily_login',          2,    1, true, 'Showed up to the app today.'),
  ('reaction',             1,    5, true, 'Reacted to a post (up to 5/day).'),
  ('achievement',          0, null, true, 'Achievements grant their reward in zaps, not gems.'),
  ('season_convert',       0, null, true, 'Season zap→gem conversion is handled by reset_season().')
on conflict (action_type) do update
  set gems_amount = excluded.gems_amount,
      daily_cap   = excluded.daily_cap,
      is_active   = excluded.is_active,
      description = excluded.description;

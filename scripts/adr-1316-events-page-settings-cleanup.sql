-- ADR-1316 — the per-page /events layout rows an operator never meant to create.
--
-- WHAT HAPPENED. `page_settings` is keyed `(space_id, route)` and `layoutScopeChain` cascades
-- `route -> /seg/* -> *`, first level with an assignment winning ENTIRELY (it is an override, not a
-- merge). The Layout editor defaults to "This page", so an operator arranging an event page saved
-- to that ONE slug every time. On 2026-09-10 there were 21 rows under `/events/`, seven of them
-- different dates of one Meld series, and ZERO at any scope key. The operator read that as the
-- editor losing their work; #2531 (ADR-1312) taught the editor to say so, and this is the cleanup
-- of what the old behaviour left behind.
--
-- 🔴 RUN ORDER MATTERS AND THE BACKUP IS NOT OPTIONAL. `page_settings` has NO soft-delete column,
-- NO deleted_at, and ZERO triggers, so a delete here is final and nothing captures the row on the
-- way out. Take the snapshot first; it is the only way back.
--
-- ⚠️ DELETING A ROW IS A VISIBLE CHANGE, NOT HOUSEKEEPING. The bucket this cleanup was expected to
-- find — rows that resolve identically to the `/events/*` baseline and could go for free — WAS
-- EMPTY. Every surviving per-page row would change what renders. In particular the baseline is the
-- only layout carrying `roles: {event-cohosts: 'host'}`, so a page that loses its row also stops
-- showing the cohosts block to non-hosts. That is why only two classes were taken and eleven rows
-- were deliberately kept.
--
-- Executed against production 2026-09-10. Recorded here so the operation is reviewable and
-- repeatable rather than living only in a session transcript.

-- ── 1. THE SNAPSHOT. Do this first, every time. ─────────────────────────────────────────────────
create table if not exists page_settings_events_backup_20260910 as
select * from public.page_settings where route like '/events/%';
-- Expect: 21 rows.

-- ── 2. DEAD ROWS — the slug resolves to no event at all. ────────────────────────────────────────
-- Zero visible change by construction: the page 404s, so there is nothing for the layout to lay
-- out. Verified before deleting with a left join against `events`, not by reading the slug.
-- `swami-s-beach-gathering-2025-07-27` is dead twice over: its `layout` is also NULL, so
-- `hasLayoutConfig` was already false and it inherited before this ran.
delete from public.page_settings
where space_id = '868b093d-ea57-4bca-b2b3-f549248582ca'
  and route in (
    '/events/meld-a-creative-coworking-experience-2026-07-29',
    '/events/meld-a-creative-coworking-experience-2026-07-29-2026-09-16',
    '/events/meld-community-cowork-launch-at-royal-temple-2026-09-02-148a01',
    '/events/meld-community-coworking',
    '/events/swami-s-beach-gathering-2025-07-27'
  );

-- ── 3. THE REPEATED-SAVE FAMILY — the rows the operator was fighting. ───────────────────────────
-- Each holds the SAME block ids as the `/events/*` baseline and differs only in ordering. Three are
-- dates of the one Meld series, saved over and over in the belief that the save was global; the
-- fourth resolves identically to one of them. `eclipse-...` is the clearest of all: it resolves
-- BYTE-FOR-BYTE to the coded default in `lib/page-settings/default-layouts.ts`, so it is a Save
-- that recorded no choice whatsoever.
--
-- Deleting these is the point of the exercise: every one of them now inherits the section baseline,
-- which is the single arrangement the operator was trying to set in the first place.
delete from public.page_settings
where space_id = '868b093d-ea57-4bca-b2b3-f549248582ca'
  and route in (
    '/events/eclipse-the-physics-of-surrender-overnight-retreat-2026-08-12',
    '/events/meld-community-coworking-royal-temple',
    '/events/unleash-your-power-activation-journey-2026-08-01',
    '/events/meld-community-cowork-launch-at-royal-temple-2026-09-02'
  );

-- ── 4. THE READBACK. ───────────────────────────────────────────────────────────────────────────
select
  (select count(*) from public.page_settings where route like '/events/%') as rows_left,      -- 12
  (select count(*) from public.page_settings where route = '/events/*')    as scope_rows,     -- 1
  (select count(*) from page_settings_events_backup_20260910)              as recoverable;    -- 21

-- ── WHAT WAS KEPT, AND WHY IT IS NOT DEBT ──────────────────────────────────────────────────────
-- Eleven rows carry a real per-event arrangement and stay. They are not near-misses; each moves a
-- block the baseline puts somewhere else:
--   · cultivating-connection-...      `event-location` pulled OUT of main into the side column
--   · heartspace-journey-2025-07-27   location in the side with cohosts beneath it
--   · hypnotic-sound                  location pinned LAST in main, below check-in
--   · mushroom-microdose-party-...    side stripped to join / schedule / cohosts, the rest in main
--   · sunset-yoga-2025-07-17          `good-to-know` leads the side ABOVE `event-join`
--   · awakening-ceremony-8-8-...      good-to-know pulled up into main, lineup pushed to side
--   · breathe-connect-expand (+ its 2026-08-20 child, which differs from its parent)
--   · ecstatic-dance-... / femme-flow-... / transformational-breathwork-...
--
-- ⚠️ THOSE LAST THREE ARE FLAGGED, NOT CLEARED. All three were saved 2026-07-14/15 and resolve to a
-- PIXEL-IDENTICAL layout across three unrelated events, which is the signature of the same
-- global-intent repeated save this file exists to clean up. They were kept anyway, because that
-- arrangement is neither a subset of the current baseline nor a match for any older one (there has
-- never been another scope-key row in this table), so "superseded" cannot be told from "still
-- wanted" from the data alone. If the owner confirms the July arrangement is abandoned, those three
-- plus the `breathe-connect-expand` pair are the natural second batch. Keeping a row costs one row;
-- deleting a wanted one costs an operator's work.

-- =============================================================================
-- The discover event RPCs re-cut their gate: a listing is public-only, a link
-- resolver honours the link (ADR-903)
-- =============================================================================
-- Purely ADDITIVE + IDEMPOTENT. NARROWING ONLY — nothing here widens any read.
--
-- WHAT WAS WRONG. `public.public_events` and `public.public_event_by_slug` are
-- both `security definer` and both granted to `anon`, so RLS on `events` does NOT
-- run inside them: the predicates in these bodies are 100% of the gate. As
-- shipped they gated `e.is_cancelled = false` (plus `e.starts_at >= now()` on the
-- listing) and NOTHING ELSE. No visibility gate at all — so a `circle_only` or
-- `private` event's title, description, city, dates and ticket price were served
-- to anonymous callers on /discover/events and on every marketing splash page.
-- That is a strictly LARGER leak than the one ADR-899 closed on the organizer
-- RPCs, which at least carried `visibility in ('public','unlisted')`.
--
-- WHY THEY WERE STALE. The bodies are, in the words of this file's own ancestor
-- header, "verbatim from 20240211000000_public_discover_reads" — 20260612020000
-- re-adopted a 2024 gate wholesale in order to add one column. Two of the four
-- missing gates were added to `events` AFTER that file was written:
--   • `status` + `removed_at` — 20260613130000_poster_events.sql, ONE DAY after.
--   • `space_id`             — 20260711020000_object_space_id.sql, ~1 month after.
-- The other two were INHERITED, not stale — they already existed and the copied
-- 2024 body simply never learned about them:
--   • `visibility`           — 20260609230000, three days BEFORE.
--   • `is_demo`              — 20260603000001, nine days BEFORE.
--
-- THE ONE ASYMMETRY, and it is deliberate. These two functions get DIFFERENT
-- visibility gates, because they are different kinds of surface:
--   • `public_events` is a LISTING. It backs /discover/events, the /discover
--     places + cities hubs and the marketing splash strips — all crawlable, all
--     enumerated. `unlisted` is LINK-ONLY (ADR-202), so it has no place here.
--     Gate: `visibility = 'public'`, singular. Same call public_calendar_feed
--     made (20261196000000), same call lib/events/series-seo.ts made, same call
--     ADR-899 made.
--   • `public_event_by_slug` is a LINK RESOLVER. The caller already holds the
--     slug; that IS the link ADR-202 says unlisted is readable by. The canonical
--     in-app twin app/(main)/events/[slug]/page.tsx re-applies the same rule by
--     hand ("public/unlisted are link-readable"). Gating this to 'public' alone
--     would 404 /discover/events/<slug> for an unlisted event while /events/
--     <slug> — the URL it canonicalises to — kept rendering. Gate:
--     `visibility in ('public','unlisted')`.
--   Crawl-safe: app/sitemap.ts emits /events/<slug>, never /discover/events/
--   <slug>, and with the LISTING narrowed no on-site link reaches an unlisted
--   discover detail page. Unlisted stays exactly as reachable as its link.
--
-- Everything else is identical on both: `status = 'published'` (a draft is
-- owner-private "even if its visibility is 'public'" — 20260613130000),
-- `removed_at is null` (staff removal must reach the anon surface; today
-- removeEvent also sets is_cancelled, so this is defence in depth against the
-- next removal path that does not), `is_demo = false` (a discovery read hard-
-- excludes seeded fiction, per circles_near 20260603000006 and ADR-899; demo_mode
-- has defaulted OFF since 20260817000000, so the real row delta is ~0), and the
-- SPACE WALL — a definer bypasses the RESTRICTIVE can_view_space_content policy
-- (20260711090000), so a public event tenanted to a private or suspended Space
-- was readable through its slug. Platform events (space_id null) pass; a Space's
-- events pass only while it is network + active. Legacy rows are trigger-stamped
-- to ROOT (20260712030000), which is network + active, so they pass unchanged.
--
--   NOTE, and it is deliberate: this wall is STRICTER than the helper it stands
--   in for, so "re-apply" understates it. can_view_space_content admits any
--   Space that is merely NOT private (so it admits the 'unlisted' Space tier
--   added by 20261142000000) and it does not look at spaces.status at all. This
--   wall admits network only, and only while the Space is active. Two extra
--   classes of row therefore drop off these anon surfaces: events owned by an
--   unlisted Space, and events owned by a suspended or archived one. Both
--   directions are NARROWING, which is the only direction this migration is
--   allowed to move, and both match the wall ADR-899 shipped one day earlier in
--   20270123000000 — the two sibling migrations are deliberately identical here
--   so the anon event surfaces cannot drift apart. If product later wants an
--   unlisted Space's public events to keep resolving by link, that is a
--   widening and needs its own ADR, not an edit to this line.
--
-- `starts_at >= now()` stays on the LISTING only and is deliberately NOT added to
-- the by-slug resolver: /discover/events/<slug> must keep rendering after the
-- event ends (hasEventEnded + suppressPastNoindex both depend on the row).
--
-- OUT COLUMNS ARE UNCHANGED on both — same ten names, same order, same types, and
-- the same argument names (`_limit`, `_slug`) and defaults — verified against
-- lib/database.types.ts. So `create or replace` cannot raise 42P13 (the error
-- that bit this repo on 2026-07-26 fires only on a CHANGED return type) and no
-- type regeneration is needed. No drop, so the anon grant is never rewritten; it
-- is re-issued anyway so a fresh replay is self-contained.
--
-- 🔴 THE ADR-899 ON-CLAUSE TRICK DOES NOT TRANSFER — DO NOT COPY IT HERE. There
-- the join was `profiles LEFT JOIN events` and the HOST row had to survive an
-- empty event set, so every event predicate had to live in the ON clause. Here
-- the join is `events LEFT JOIN circles`: `events` is the DRIVING table, so an
-- `e.` predicate in the circles ON clause would filter nothing and merely blank
-- the circle columns — a security fix that silently fixes nothing. Every new
-- predicate belongs in the outer WHERE. What must NOT change is the LEFT JOIN
-- itself: making it an inner join would erase every standalone (non-circle)
-- event (ADR-254). Both properties are pinned by
-- test/contract/public-events-rpc-gate.test.ts.
--
-- Reversible: re-run the two bodies from 20260612020000_public_events_price.sql.
-- See docs/DECISIONS.md ADR-903.
-- =============================================================================

-- ── 1. public_events — the crawlable discover LISTING ────────────────────────
create or replace function public.public_events(_limit integer default 50)
returns table (
  id          uuid,
  slug        text,
  title       text,
  description text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  city        text,
  circle_id   uuid,
  circle_name text,
  price_cents integer
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
         c.city, c.id, c.name, e.price_cents
  from   public.events e
  -- 🔴 LEFT, always. A standalone event has no circle (ADR-254) and must still list.
  left join public.circles c
         on e.scope_type = 'circle' and e.scope_id = c.id
  where  e.is_cancelled = false
    and  e.starts_at >= now()
    -- (1) a draft is owner-private regardless of visibility (20260613130000).
    and  coalesce(e.status, 'published') = 'published'
    -- (2) staff removal must reach the anon surface.
    and  e.removed_at is null
    -- (3) PUBLIC ONLY. This is a listing, and 'unlisted' is a link (ADR-202).
    --     Never circle_only, never private.
    and  e.visibility = 'public'
    -- (4) a definer bypasses can_view_space_content; re-apply the Space wall.
    and  (e.space_id is null
          or exists (select 1 from public.spaces s
                     where s.id = e.space_id
                       and s.visibility = 'network'
                       and s.status = 'active'))
    -- (5) discovery/crawl reads hard-exclude demo content.
    and  e.is_demo = false
  order by e.starts_at asc
  limit  greatest(1, least(_limit, 200));
$$;

grant execute on function public.public_events(integer) to anon, authenticated;

comment on function public.public_events(integer) is
  'Upcoming PUBLISHED, PUBLIC, non-removed, non-demo events on a network-visible active Space (or no Space), for the anon /discover listings and the marketing splash strips (narrowed by ADR-903). City only, never the venue. Never draft, removed, unlisted, circle_only, private or demo. The join to circles stays LEFT so standalone events (ADR-254) still list.';


-- ── 2. public_event_by_slug — the LINK RESOLVER for one event ────────────────
-- Same gate EXCEPT visibility: the caller holds the slug, and ADR-202 says that
-- link is exactly what makes an unlisted event readable. Matches the hand-written
-- gate on the canonical twin, app/(main)/events/[slug]/page.tsx. No starts_at
-- floor: a past event's page stays live and self-manages its robots directives.
create or replace function public.public_event_by_slug(_slug text)
returns table (
  id          uuid,
  slug        text,
  title       text,
  description text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  city        text,
  circle_id   uuid,
  circle_name text,
  price_cents integer
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
         c.city, c.id, c.name, e.price_cents
  from   public.events e
  -- 🔴 LEFT, always. A standalone event has no circle (ADR-254) and must still resolve.
  left join public.circles c
         on e.scope_type = 'circle' and e.scope_id = c.id
  where  e.slug = _slug
    and  e.is_cancelled = false
    -- (1) a draft is owner-private regardless of visibility (20260613130000).
    and  coalesce(e.status, 'published') = 'published'
    -- (2) staff removal must reach the anon surface.
    and  e.removed_at is null
    -- (3) LINK-READABLE ONLY. 'unlisted' belongs here and nowhere in a listing
    --     (ADR-202); circle_only and private never resolve for anon.
    and  e.visibility in ('public', 'unlisted')
    -- (4) a definer bypasses can_view_space_content; re-apply the Space wall.
    and  (e.space_id is null
          or exists (select 1 from public.spaces s
                     where s.id = e.space_id
                       and s.visibility = 'network'
                       and s.status = 'active'))
    -- (5) discovery reads hard-exclude demo content.
    and  e.is_demo = false
  limit  1;
$$;

grant execute on function public.public_event_by_slug(text) to anon, authenticated;

comment on function public.public_event_by_slug(text) is
  'One PUBLISHED, non-removed, non-demo event resolved BY ITS LINK for the anon /discover/events/<slug> twin (narrowed by ADR-903). Admits public AND unlisted, because a slug is the link ADR-202 makes unlisted readable by; never circle_only, private, draft, removed, demo, or owned by a non-network/inactive Space. Past events still resolve so the page can render its ended state.';

-- =============================================================================
-- Events — Boops: persisted event-post reactions (EVENTS-REWORK B3, ADR-255
-- interactive layer; docs/EVENTS-DESIGN.md §2.2/§8).
--
-- WHY: the activity feed's "Boop" bar was session-local — it could reflect YOUR own
-- tap but never a shared tally, because there was no reaction store to ride. This
-- adds one additive table so Boops become real, aggregatable counts (Law: a number
-- is real or it's absent — now they're real).
--
-- One row = one member's one reaction (one face) on one event post. UNIQUE
-- (post_id, profile_id, kind) makes a member's reaction toggle, not stack, and makes
-- a double-tap idempotent. `kind` is the emoji face (👋 🔥 🎉 ❤️ 😂); kept as text so
-- the reaction set can grow without a migration.
--
-- RLS mirrors the established helper-function style and the sibling
-- 20260613100000_event_posts_media_cohosts.sql (get_my_profile_id() /
-- can_read_event() / is_my_event(); NEVER raw auth.uid() in app-table policies):
--   • SELECT  — anyone who can read the parent event (so counts match visibility).
--   • INSERT  — your own reaction, and only if you're on the event (host/guest).
--   • DELETE  — your own reaction (un-boop). No host moderation of a reaction —
--               there's nothing to moderate; a member only ever owns their own tap.
--
-- The new table isn't in lib/database.types.ts yet, so readers/writers use the
-- `as unknown as SupabaseClient` cast convention (lib/events/reactions.ts), same as
-- event_ticket_types / capacity columns. Additive + backward-compatible.
-- =============================================================================

-- ── event_post_reactions ─────────────────────────────────────────────────────
create table if not exists public.event_post_reactions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.event_posts(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id)    on delete cascade,
  -- The reaction face. Stored as text so the Boop set can grow without a migration;
  -- the app layer validates against the known set before writing.
  kind        text not null,
  created_at  timestamptz not null default now(),
  -- A member reacts at most once per (post, face) — toggles instead of stacking.
  constraint event_post_reactions_unique unique (post_id, profile_id, kind),
  constraint event_post_reactions_kind_not_empty check (length(trim(kind)) > 0)
);

-- Aggregating counts per post is the hot read (the activity feed loads them for the
-- visible posts), so index by post. The unique constraint already covers the
-- (post, profile, kind) lookup a toggle does.
create index if not exists event_post_reactions_post_idx
  on public.event_post_reactions (post_id);
create index if not exists event_post_reactions_profile_idx
  on public.event_post_reactions (profile_id);

-- ── Helper: which event does this post belong to? ────────────────────────────
-- Reactions authorize against the post's PARENT EVENT (read the event ⇒ see its
-- reactions; on the event ⇒ may react). The reaction policies need the event id
-- from the post id, so resolve it through a SECURITY DEFINER helper that reads
-- event_posts without recursing into its RLS. Pinned search_path per convention.
create or replace function public.event_id_for_post(p_post_id uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select p.event_id from public.event_posts p where p.id = p_post_id;
$$;

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.event_post_reactions enable row level security;

-- SELECT: anyone who can read the parent event reads its reactions, so the visible
-- count always matches event visibility (reuses can_read_event from the sibling
-- migration 20260613100000).
-- INSERT: your own reaction (profile_id = you) and only when you're on the event
-- (is_my_event = host or any-intent RSVP), exactly like posting a comment.
-- DELETE: your own reaction only — un-boop. There is no host-moderation path: a
-- member only ever owns their own tap, and removing it is theirs alone.
drop policy if exists "event_post_reactions: read if can see event"  on public.event_post_reactions;
drop policy if exists "event_post_reactions: own insert if on event" on public.event_post_reactions;
drop policy if exists "event_post_reactions: own delete"             on public.event_post_reactions;

create policy "event_post_reactions: read if can see event"
  on public.event_post_reactions for select
  using (can_read_event(event_id_for_post(post_id)));

create policy "event_post_reactions: own insert if on event"
  on public.event_post_reactions for insert
  with check (
    profile_id = get_my_profile_id()
    and is_my_event(event_id_for_post(post_id))
  );

create policy "event_post_reactions: own delete"
  on public.event_post_reactions for delete
  using (profile_id = get_my_profile_id());

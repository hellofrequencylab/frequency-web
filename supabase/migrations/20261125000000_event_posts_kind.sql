-- =============================================================================
-- Events — activity-feed post KIND (RSVP announcements)
--
-- The event activity feed (event_posts) carried only guest comments. When a
-- member RSVPs "going" we now drop a small "<Name> RSVP'd" entry into that same
-- feed (with the member's optional note as the body) so the conversation reflects
-- who is coming. Distinguish those system entries from ordinary comments with a
-- `kind` column, and enforce ONE RSVP entry per member per event so changing an
-- RSVP updates the existing row instead of spamming the feed.
--
-- Additive + backward compatible: every existing row and every future comment
-- defaults to 'comment', so the comment path (createEventPost) is untouched.
--
-- NOTE: not yet applied to the remote database and not yet reflected in
-- lib/database.types.ts — writers/readers use the untyped-client cast convention
-- (same as event_ticket_types / event_dispatches) until the types are regenerated.
-- =============================================================================

alter table public.event_posts
  add column if not exists kind text not null default 'comment';

-- Only the two shapes the app writes: an ordinary guest comment, or a system
-- RSVP announcement. A CHECK keeps a stray value from ever landing.
alter table public.event_posts
  drop constraint if exists event_posts_kind_check;
alter table public.event_posts
  add constraint event_posts_kind_check
  check (kind in ('comment', 'rsvp'));

-- Idempotency: at most one 'rsvp' entry per (event, member). A member changing
-- their RSVP (or editing their note) updates that single row; comments are
-- unconstrained (a member may leave many). Partial unique index scoped to rsvp.
create unique index if not exists event_posts_one_rsvp_per_member
  on public.event_posts (event_id, profile_id)
  where kind = 'rsvp';

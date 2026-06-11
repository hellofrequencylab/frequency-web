-- =====================================================================
-- Creator tips: event posters join the queue (Vera's poster observer)
--
-- The poster-events honesty bands (lib/events/poster-quality.ts) already
-- throttle the reward deterministically. This adds the qualitative layer:
-- Vera reviews posters whose pattern needs attention and drafts either a
-- coaching TIP to the poster or an internal spam FLAG for the admin, both
-- through the existing creator_tips draft-and-approve queue.
--
--   1. content_type gains 'event' so a tip/flag can be about a poster's
--      posted town events (content_id = their most recent posted event).
--   2. `kind` distinguishes a coaching tip (sendable to the member after
--      approval, exactly like journey/practice tips) from an internal
--      flag (admin-only; approving a flag only marks it reviewed and
--      NEVER inserts a notification; send is disabled for flags).
--
-- Additive + idempotent. RLS unchanged: creator_tips stays service-role
-- only (no public policies; janitor-gated server actions).
-- =====================================================================

-- 1. content_type: allow 'event' --------------------------------------------
alter table public.creator_tips drop constraint if exists creator_tips_content_type_check;
alter table public.creator_tips add constraint creator_tips_content_type_check
  check (content_type in ('journey', 'practice', 'challenge', 'event'));

comment on column public.creator_tips.content_type is
  'What the tip is about: journey | practice | challenge | event. For event rows, content_id is the poster''s most recent posted event.';

-- 2. kind: coaching tip vs internal flag -------------------------------------
alter table public.creator_tips add column if not exists kind text not null default 'tip';
alter table public.creator_tips drop constraint if exists creator_tips_kind_check;
alter table public.creator_tips add constraint creator_tips_kind_check
  check (kind in ('tip', 'flag'));

comment on column public.creator_tips.kind is
  'tip = a coaching nudge destined for the creator (draft -> approved -> sent). flag = an internal spam/quality flag for the admin: never sent to the member, send is disabled; approving it only marks it reviewed.';

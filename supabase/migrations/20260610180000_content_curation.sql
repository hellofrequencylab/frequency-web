-- =====================================================================
-- Content curation (admin content suite, ADR-211). Two additive pieces:
--
-- 1. `featured_at` marks on journey_plans + practices — the staff "feature"
--    flag that lifts top member-created content into the official surfaces.
--    A timestamp (not a boolean) so featured lists can sort by recency and
--    the mark doubles as an audit trail.
-- 2. `creator_tips` — Vera's draft-and-approve queue. Vera analyzes the
--    performance signals of member-created content and DRAFTS one engagement
--    tip per creator/content; an admin (janitor) reviews, edits, and sends.
--    Vera never messages a member without approval: a tip only reaches its
--    creator when an admin moves it draft -> approved -> sent, which inserts
--    a `notifications` row.
--
-- Additive + idempotent. RLS: creator_tips has NO public policies — the queue
-- is service-role only (all reads/writes go through janitor-gated server
-- actions on the admin client).
-- =====================================================================

-- 1. Featured marks --------------------------------------------------------
alter table public.journey_plans add column if not exists featured_at timestamptz;
alter table public.practices     add column if not exists featured_at timestamptz;

comment on column public.journey_plans.featured_at is
  'Staff feature mark (admin content suite). Null = not featured; set = featured at this time.';
comment on column public.practices.featured_at is
  'Staff feature mark (admin content suite). Null = not featured; set = featured at this time.';

-- NOTE: practices_ranked is a frozen-column view (see 20260606160000), so it
-- does NOT gain featured_at. The admin reads fetch featured_at from practices
-- directly; the view is deliberately left untouched.

-- 2. Vera's creator-tips queue ----------------------------------------------
create table if not exists public.creator_tips (
  id           uuid        primary key default gen_random_uuid(),
  creator_id   uuid        not null references public.profiles(id) on delete cascade,
  content_type text        not null check (content_type in ('journey','practice','challenge')),
  content_id   uuid        not null,
  status       text        not null default 'draft'
                           check (status in ('draft','approved','sent','dismissed')),
  draft_text   text        not null,
  sent_text    text,
  evidence     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz default now(),
  reviewed_by  uuid        references public.profiles(id),
  sent_at      timestamptz
);

create index if not exists creator_tips_status_idx  on public.creator_tips (status);
create index if not exists creator_tips_creator_idx on public.creator_tips (creator_id);

-- Service-role only: enable RLS with no policies (fail closed).
alter table public.creator_tips enable row level security;

comment on table public.creator_tips is
  'Vera''s draft-and-approve engagement tips to creators of well-performing member content. Service-role only; janitor-gated actions move draft -> approved -> sent (notification insert) or dismissed.';
comment on column public.creator_tips.creator_id is
  'The member who authored the content the tip is about (the notification recipient on send).';
comment on column public.creator_tips.content_type is
  'What the tip is about: journey | practice | challenge.';
comment on column public.creator_tips.content_id is
  'Id of the journey_plans / practices / season_challenges row (no FK: three possible parents).';
comment on column public.creator_tips.status is
  'draft (Vera wrote it) -> approved (admin signed off) -> sent (notification delivered) | dismissed.';
comment on column public.creator_tips.draft_text is
  'Vera''s draft, editable by the reviewing admin before sending.';
comment on column public.creator_tips.sent_text is
  'The exact text delivered to the creator (set on send; may differ from the draft after edits).';
comment on column public.creator_tips.evidence is
  'The performance numbers the tip is grounded in (adopters, logs, forks, title) at draft time.';
comment on column public.creator_tips.reviewed_by is
  'The admin who approved or dismissed the tip.';
comment on column public.creator_tips.sent_at is
  'When the tip reached the creator (notifications insert).';

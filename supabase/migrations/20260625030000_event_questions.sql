-- =============================================================================
-- Event questions (EVENTS-REWORK Track A1 — the guest questionnaire: dietary,
-- song requests, accessibility, etc.).
--
-- Two tables:
--   • event_questions        — host-defined questions on an event (ordered, typed).
--   • event_question_answers — one answer per (question, profile). Answers are
--                              SENSITIVE: readable only by the host/cohost and the
--                              author. RLS enforces that.
--
-- RLS reuses the established helpers (can_read_event / is_my_event /
-- is_event_cohost / get_my_profile_id) from 20260613100000 — no new helper. New
-- tables are not in lib/database.types.ts yet → the data layer uses the
-- `as unknown as SupabaseClient` cast convention, same as event_ticket_types.
-- =============================================================================

-- ── event_questions ──────────────────────────────────────────────────────────
-- type drives the input the UI renders and how an answer is validated:
--   short_text | long_text | dropdown | multi_select | boolean | number
-- `options` is the choice list for dropdown / multi_select (jsonb array), else [].
create table if not exists public.event_questions (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.events(id) on delete cascade,
  prompt      text        not null,
  type        text        not null default 'short_text',
  options     jsonb       not null default '[]'::jsonb,
  required    boolean     not null default false,
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  constraint event_questions_prompt_not_empty check (length(trim(prompt)) > 0),
  constraint event_questions_type_check
    check (type in ('short_text', 'long_text', 'dropdown', 'multi_select', 'boolean', 'number')),
  constraint event_questions_options_array check (jsonb_typeof(options) = 'array')
);

create index if not exists event_questions_event_idx
  on public.event_questions (event_id, position);

-- ── event_question_answers ───────────────────────────────────────────────────
create table if not exists public.event_question_answers (
  id          uuid        primary key default gen_random_uuid(),
  question_id uuid        not null references public.event_questions(id) on delete cascade,
  event_id    uuid        not null references public.events(id)          on delete cascade,
  profile_id  uuid        not null references public.profiles(id)        on delete cascade,
  -- Free-form for text/number/boolean; for multi_select the app stores a JSON
  -- array string. One answer per person per question.
  answer      text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint event_question_answers_unique unique (question_id, profile_id)
);

create index if not exists event_question_answers_event_idx
  on public.event_question_answers (event_id);
create index if not exists event_question_answers_question_idx
  on public.event_question_answers (question_id);
create index if not exists event_question_answers_profile_idx
  on public.event_question_answers (profile_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.event_questions        enable row level security;
alter table public.event_question_answers enable row level security;

-- Questions: anyone who can read the event sees the questions (a guest must read
-- them to answer). Only the host or a cohost authors/edits/removes them.
drop policy if exists "event_questions: read if can see event" on public.event_questions;
drop policy if exists "event_questions: host or cohost write"   on public.event_questions;
drop policy if exists "event_questions: host or cohost update"  on public.event_questions;
drop policy if exists "event_questions: host or cohost delete"  on public.event_questions;

create policy "event_questions: read if can see event"
  on public.event_questions for select
  using (can_read_event(event_id));

create policy "event_questions: host or cohost write"
  on public.event_questions for insert
  with check (
    event_id in (select id from public.events where host_id = get_my_profile_id())
    or is_event_cohost(event_id, get_my_profile_id())
  );

create policy "event_questions: host or cohost update"
  on public.event_questions for update
  using (
    event_id in (select id from public.events where host_id = get_my_profile_id())
    or is_event_cohost(event_id, get_my_profile_id())
  )
  with check (
    event_id in (select id from public.events where host_id = get_my_profile_id())
    or is_event_cohost(event_id, get_my_profile_id())
  );

create policy "event_questions: host or cohost delete"
  on public.event_questions for delete
  using (
    event_id in (select id from public.events where host_id = get_my_profile_id())
    or is_event_cohost(event_id, get_my_profile_id())
  );

-- Answers are sensitive. SELECT: the author (their own answer) OR the event
-- host/cohost (to read the roster). No one else — not even other guests who can
-- read the event. INSERT/UPDATE/DELETE: the author only, on their own row, and
-- only when they can read the event (so they're actually a guest of it).
drop policy if exists "event_question_answers: author or host read"   on public.event_question_answers;
drop policy if exists "event_question_answers: author insert own"     on public.event_question_answers;
drop policy if exists "event_question_answers: author update own"     on public.event_question_answers;
drop policy if exists "event_question_answers: author delete own"     on public.event_question_answers;

create policy "event_question_answers: author or host read"
  on public.event_question_answers for select
  using (
    profile_id = get_my_profile_id()
    or event_id in (select id from public.events where host_id = get_my_profile_id())
    or is_event_cohost(event_id, get_my_profile_id())
  );

create policy "event_question_answers: author insert own"
  on public.event_question_answers for insert
  with check (
    profile_id = get_my_profile_id()
    and can_read_event(event_id)
  );

create policy "event_question_answers: author update own"
  on public.event_question_answers for update
  using (profile_id = get_my_profile_id())
  with check (profile_id = get_my_profile_id());

create policy "event_question_answers: author delete own"
  on public.event_question_answers for delete
  using (profile_id = get_my_profile_id());

comment on table public.event_questions is
  'Host-defined questionnaire on an event (EVENTS-REWORK A1). Readable by anyone who can read the event; authored by host/cohost.';
comment on table public.event_question_answers is
  'Guest answers. SENSITIVE: readable only by the author and the event host/cohost (never other guests). One answer per (question, profile).';

-- Journey lesson blocks — the e-learning layer (ADR-244).
--
-- Turns a Journey into a proper course without disturbing the practice-rhythm engine.
-- A journey "item" was always exactly one practice; this generalizes it into a typed
-- BLOCK (practice | lesson | resource | check | section), so a journey can hold header
-- video, video lessons, readings, knowledge checks, and section groupings ALONGSIDE the
-- real-world practices it already coaches. Everything here is ADDITIVE and backfills
-- existing rows to block_type='practice' — no behavior change until content is authored.
--
-- Completion stays two independent tracks (ADR-244): practices keep their derived
-- seasonal rhythm/quest rewards (untouched, off practice_logs), while LESSON completion is
-- the one genuinely new bit of persisted progress (journey_lesson_progress below).

-- ── 1. Generalize journey_plan_items into typed blocks ──────────────────────────────
alter table public.journey_plan_items
  add column if not exists block_type text not null default 'practice'
    check (block_type in ('practice', 'lesson', 'resource', 'check', 'section')),
  -- Self-FK: a block can sit under a 'section' block → Course → Modules → Lessons.
  add column if not exists parent_id uuid references public.journey_plan_items(id) on delete cascade,
  add column if not exists title text,
  add column if not exists body text,                         -- markdown lesson copy
  add column if not exists media jsonb not null default '{}'::jsonb,    -- video {provider,id,url}, images[], files[], captions/transcript
  add column if not exists settings jsonb not null default '{}'::jsonb, -- type extras: quiz options, gating, etc.
  add column if not exists required boolean not null default true,      -- does this block count toward course completion?
  add column if not exists est_minutes int;

-- practice_id is required only for practice blocks now (lesson/section blocks carry none).
alter table public.journey_plan_items alter column practice_id drop not null;

-- Replace the blanket unique(plan_id, practice_id) with a PARTIAL unique index: practices
-- still can't duplicate within a plan, but many lesson/section blocks (null practice_id)
-- may coexist. The inline `unique (plan_id, practice_id)` was auto-named
-- journey_plan_items_plan_id_practice_id_key; drop defensively in case of a rename.
do $$
declare
  c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.journey_plan_items'::regclass
    and contype = 'u'
    and conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = 'public.journey_plan_items'::regclass
        and attname in ('plan_id', 'practice_id')
    );
  if c is not null then
    execute format('alter table public.journey_plan_items drop constraint %I', c);
  end if;
end $$;

create unique index if not exists journey_plan_items_plan_practice_uniq
  on public.journey_plan_items (plan_id, practice_id)
  where practice_id is not null;

-- Shape guard: a practice block must carry a practice; a non-practice block must not.
-- Existing rows are all practices with practice_id set, so they already satisfy it.
alter table public.journey_plan_items
  add constraint journey_plan_items_practice_shape
  check ((block_type = 'practice') = (practice_id is not null)) not valid;
alter table public.journey_plan_items validate constraint journey_plan_items_practice_shape;

-- ── 2. Journey-level: hero video + optional sequential gating ───────────────────────
alter table public.journey_plans
  add column if not exists intro_video text,                          -- header/hero video to pair with `intro`
  add column if not exists sequential boolean not null default false; -- on = unlock next block when prior required ones are done

-- ── 3. Lesson completion — the one net-new progress store ───────────────────────────
-- Practices stay DERIVED from practice_logs; lesson check-offs need real persistence
-- (check-off, % complete, "resume where you left off" via last_position).
create table if not exists public.journey_lesson_progress (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  plan_id      uuid not null references public.journey_plans(id) on delete cascade,
  item_id      uuid not null references public.journey_plan_items(id) on delete cascade,
  completed_at timestamptz not null default now(),
  last_position int,                                  -- e.g. video seconds watched, for resume
  unique (profile_id, item_id)
);

create index if not exists journey_lesson_progress_profile_plan
  on public.journey_lesson_progress (profile_id, plan_id);

alter table public.journey_lesson_progress enable row level security;

-- Members read/write only their own lesson progress (mirrors journey_plan_adoptions).
create policy journey_lesson_progress_select_own on public.journey_lesson_progress
  for select using (profile_id = get_my_profile_id());
create policy journey_lesson_progress_insert_own on public.journey_lesson_progress
  for insert with check (profile_id = get_my_profile_id());
create policy journey_lesson_progress_update_own on public.journey_lesson_progress
  for update using (profile_id = get_my_profile_id()) with check (profile_id = get_my_profile_id());
create policy journey_lesson_progress_delete_own on public.journey_lesson_progress
  for delete using (profile_id = get_my_profile_id());

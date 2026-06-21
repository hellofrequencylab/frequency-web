-- =============================================================================
-- Practice-timer redesign, schema 1/3: the Mindless MODE + an author duration lock
-- on practices (the completion-economy data model; WEBSITE-CHANGES-PLAN practice-
-- timer redesign).
--
-- WHY: a timer_kind = 'mindless' practice can be one of several flavours (a meditation,
-- a breath set, a journal, a stillness sit, a ritual, or a plain log). The on-air rails
-- and the practice page read `mindless_mode` to dress the same Mindless timer for the
-- right flavour. The column is NULLABLE: a null means "derive the mode from the practice's
-- Pillar at read time" (lib/practices.pillarTimerDefault), so legacy rows need no backfill
-- to behave. `duration_locked` lets an author pin a fixed length (the member cannot adjust
-- it); the default false preserves today's behavior (members can always adjust the length).
--
-- NOTE: regenerate lib/database.types.ts after apply (the integrator's step). Until then
-- lib/practices.ts reaches mindless_mode / duration_locked through its untyped admin
-- handle (ADR-246 untyped casts).
-- =============================================================================

-- 1. The Mindless-mode enum.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'practice_mindless_mode') then
    create type public.practice_mindless_mode as enum
      ('meditate', 'breathe', 'journal', 'stillness', 'ritual', 'log');
  end if;
end$$;

-- 2. The columns. mindless_mode is nullable (null = derive from Pillar at read time);
--    duration_locked defaults false so members keep the freedom to adjust the length.
alter table public.practices
  add column if not exists mindless_mode public.practice_mindless_mode;

alter table public.practices
  add column if not exists duration_locked boolean not null default false;

comment on column public.practices.mindless_mode is
  'Which flavour the Mindless timer wears when timer_kind = mindless: meditate | breathe | journal | stillness | ritual | log. NULLABLE — a null means derive the mode from the practice''s Pillar at read time (lib/practices.pillarTimerDefault), so legacy rows need no backfill.';
comment on column public.practices.duration_locked is
  'When true, the author has pinned a fixed session length and the member cannot adjust it; when false (the default), the member can adjust the length. Length lives in duration_min.';

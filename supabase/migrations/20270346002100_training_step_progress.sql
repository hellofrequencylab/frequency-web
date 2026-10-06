-- A trainee's progress through a role-training path is stored per step (LIVE-690).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- training_paths recorded a whole path as assigned, started or completed, so a member halfway
-- through Host Training looked the same as one who had not opened it. completed_steps holds the
-- ids of the steps the member has marked done (lib/onboarding/training.ts setTrainingStep). Ids
-- are the stable TrainingStep.id from lib/onboarding/training-curriculum.ts, so an operator
-- relabelling or reordering a step in /admin/content/training keeps everyone's progress.
--
-- Writes go through the service role only (the existing pattern for this table); the existing
-- select policy already lets a member read their own row, so no RLS or grant changes.
-- The cap is generous: a path holds at most 12 steps (CURRICULUM_LIMITS.maxSteps).
--
-- Additive and idempotent. ROLLBACK: alter table public.training_paths drop column completed_steps;

alter table public.training_paths
  add column if not exists completed_steps text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'training_paths_completed_steps_cap' and conrelid = 'public.training_paths'::regclass
  ) then
    alter table public.training_paths
      add constraint training_paths_completed_steps_cap check (cardinality(completed_steps) <= 50);
  end if;
end $$;

comment on column public.training_paths.completed_steps is
  'Ids of the curriculum steps this member has marked done (LIVE-690, lib/onboarding/training.ts).';

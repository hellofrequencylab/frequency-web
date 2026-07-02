-- Verification-gated Zaps (ADR-418 completion; product decision 2026-07-02): a crew task with
-- requires_verification HOLDS its Zaps on completion and only CREDITS them when the completion is
-- verified. Verification methods: leader grant (built here), or timer / location / code (the
-- verifyCrewCompletion hook — auto-methods wired as their entry points land). Held-then-released:
-- the credit lands the moment verification happens; nothing is lost. Tasks without
-- requires_verification credit immediately, exactly as before.
--
-- Credit model (rewards_economy_v2): after_crew_completion writes a `zap_transactions` ledger row;
-- a separate trigger derives current_season_zaps + rank from the ledger. Gating therefore means
-- withholding the LEDGER ROW until verification, not touching the balance directly.

-- 1. Columns (untyped until lib/database.types.ts regenerates, ADR-246).
alter table public.crew_completions add column if not exists verified_at timestamptz;
alter table public.crew_completions add column if not exists verification_method text; -- 'leader'|'timer'|'location'|'code'
alter table public.crew_tasks add column if not exists verification_method text;        -- the task's expected method; null => 'leader'

comment on column public.crew_completions.verified_at is
  'When this completion was verified (null = held, unverified). The release trigger writes the held Zap ledger row on the null -> set transition.';
comment on column public.crew_tasks.verification_method is
  'How a requires_verification task is verified: leader | timer | location | code (null => leader).';

-- 2. Backfill BEFORE the release trigger exists, so this update credits nothing: existing
--    already-approved completions (verified_by set) were already credited by the old
--    credit-on-insert trigger. Stamp verified_at so the new release trigger never re-fires.
update public.crew_completions
   set verified_at = coalesce(completed_at, now()),
       verification_method = coalesce(verification_method, 'leader')
 where verified_by is not null and verified_at is null;

-- 3. AFTER INSERT: write the Zap ledger row UNLESS the task requires verification and this row is
--    not yet verified (an auto-method may insert with verified_at already set -> credit now).
create or replace function public.after_crew_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _requires boolean;
begin
  select requires_verification into _requires from public.crew_tasks where id = NEW.task_id;
  if coalesce(_requires, false) and NEW.verified_at is null then
    return NEW; -- Zaps held until verified: no ledger row yet
  end if;
  if coalesce(NEW.zaps_earned, 0) > 0 then
    insert into public.zap_transactions (profile_id, action_type, amount, metadata)
    values (NEW.profile_id, 'crew_task', NEW.zaps_earned, jsonb_build_object('task_id', NEW.task_id));
  end if;
  return NEW;
end;
$$;

-- 4. AFTER UPDATE: release the held Zaps when verified_at transitions null -> set, but ONLY for a
--    task that requires verification (so a stray update on an already-credited row can't double-pay).
create or replace function public.after_crew_completion_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _requires boolean;
begin
  if OLD.verified_at is null and NEW.verified_at is not null then
    select requires_verification into _requires from public.crew_tasks where id = NEW.task_id;
    if coalesce(_requires, false) and coalesce(NEW.zaps_earned, 0) > 0 then
      insert into public.zap_transactions (profile_id, action_type, amount, metadata)
      values (NEW.profile_id, 'crew_task', NEW.zaps_earned, jsonb_build_object('task_id', NEW.task_id, 'verified', true));
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_after_crew_completion_verified on public.crew_completions;
create trigger trg_after_crew_completion_verified
  after update on public.crew_completions
  for each row
  execute function public.after_crew_completion_verified();

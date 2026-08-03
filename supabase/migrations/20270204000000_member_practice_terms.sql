-- Adoption lifecycle Phase 1 (ADR-920): a member_practices row becomes a real commitment with a
-- shape, not a permanent boolean. Additive only — every column is nullable or defaulted, so the
-- existing adopt/drop paths keep working untouched until the app layer starts writing terms.
--
-- The model (owner decisions 2026-08-03 + the habit-formation evidence base):
--   * source        — 'self' (the member tapped Adopt) vs 'journey' (enrollment wrote it).
--                     Journey-sourced rows are phase-scoped and ride OUTSIDE the active-practice
--                     cap; self rows count against it (cap 5, enforced in app code).
--   * term_weeks    — the commitment length in weeks. NULL = ongoing (no end). Presets 2/4/8;
--                     4 is the default, 8 is the "builds it for good" recommendation (habit
--                     automaticity medians ~66 days, Lally 2010).
--   * starts_on / ends_on — the member-local calendar window (same day framing as
--                     practice_logs.logged_for). ends_on NULL = ongoing.
--   * retired_at / retired_reason — the lifecycle exit, replacing the bare active=false toggle
--                     that lost all history. active stays the ONE live flag every reader already
--                     filters on; retirement writes BOTH (active=false + the why).
--   * cue           — the member's own implementation intention ("After my morning coffee").
--                     Optional, member-authored, capped in app code. Implementation intentions
--                     carry d=0.65 on goal attainment (Gollwitzer & Sheeran 2006).
--   * journey_plan_id — which Journey wrote a 'journey' row, so phase rollover can retire
--                     exactly its own leg and never touch a self adoption of the same practice.

alter table public.member_practices
  add column if not exists source text not null default 'self'
    check (source in ('self', 'journey')),
  add column if not exists journey_plan_id uuid references public.journey_plans(id) on delete set null,
  add column if not exists term_weeks smallint
    check (term_weeks between 1 and 52),
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists retired_at timestamptz,
  add column if not exists retired_reason text
    check (retired_reason in ('completed', 'phase_ended', 'dropped', 'swapped')),
  add column if not exists cue text
    check (cue is null or char_length(cue) <= 140);

-- Belt-and-braces: an EARLIER pre-merge revision of this file created this constraint; any
-- database that ran that revision (a branch DB, a local stack, a preview) must shed it, or
-- deleting an ever-enrolled plan aborts on the FK's SET NULL. No-op everywhere else.
alter table public.member_practices
  drop constraint if exists member_practices_source_journey_check;

-- NO check tying source='journey' to a non-null journey_plan_id, DELIBERATELY: the FK above is
-- `on delete set null`, so deleting a journey_plans row nulls journey_plan_id on every
-- referencing row (active and retired alike) — a check requiring the pair would make every
-- ever-enrolled plan undeletable (the SET NULL itself would violate it and abort the DELETE).
-- The pairing is an app-code contract (adoptPracticesForJourney always writes both), and
-- deletePlan retires a plan's journey rows explicitly before deleting.

-- The completion sweep's hot path: active commitments whose term has ended.
create index if not exists member_practices_term_end_idx
  on public.member_practices (ends_on)
  where active and ends_on is not null;

-- Per-journey retirement (phase rollover retires exactly one journey's leg).
create index if not exists member_practices_journey_idx
  on public.member_practices (profile_id, journey_plan_id)
  where journey_plan_id is not null;

comment on column public.member_practices.source is
  'self = the member adopted it; journey = enrollment wrote it (phase-scoped, outside the active cap). ADR-920.';
comment on column public.member_practices.term_weeks is
  'Commitment length in weeks (presets 2/4/8, default 4). NULL = ongoing. ADR-920.';
comment on column public.member_practices.ends_on is
  'Member-local last day of the term (same day framing as practice_logs.logged_for). NULL = ongoing.';
comment on column public.member_practices.retired_reason is
  'Why the commitment ended: completed (term ran its course), phase_ended (journey leg rolled), dropped (member removed it), swapped (made room at the cap).';
comment on column public.member_practices.cue is
  'The member''s own implementation intention ("After my morning coffee"), <=140 chars. Optional.';

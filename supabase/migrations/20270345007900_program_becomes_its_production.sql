-- THE PROGRAM A PLAN BECAME (topical_channels.space_plan_id) — PROG-CAL9, ADR-1386.
--
-- ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────────────────────────
-- `space_plans.target_kind` has offered 'program' since 2026-09-19, and the Plan board's "Make it a
-- Production" button rendered for those Plans. PROG-CAL8 made the button open a real page
-- (/spaces/<slug>/settings/program; it used to point at a segment holding only a layout), and left
-- the door carrying NO plan parameter on purpose: nothing on that page read one, and a parameter
-- nothing reads is the same class of lie as an href nothing serves. So a Plan whose target is a
-- Program could open its door and never record that it walked through it: the Program was created,
-- the Plan sat under Planning for ever, and nothing anywhere could say which Program it became.
-- The href now carries the Plan (lib/calendar/plans.ts). This column is the other half: the place
-- the answer lives once the Program exists.
--
-- ── WHY THE COLUMN IS `space_plan_id` AND NOT `plan_id` ─────────────────────────────────────────
-- 🔴 A PROGRAM *IS* A CHANNEL, in this schema: a `topical_channels` row whose `template_id` is its
-- Chapter blueprint (a `circle_templates` row). The Channel already carries three ids that each
-- mean a different thing — `id` (the Channel), `template_id` (the blueprint), `owner_space_id`
-- (who runs it) — and a bare `plan_id` beside them would be read by the next person as a fourth
-- kind of blueprint or as the Space's PRICING plan (`spaces.plan`, asSpacePlan). `space_plan_id`
-- names the table it points at, is the same spelling `journey_plans.space_plan_id` settled for the
-- Journey half (migration 20270345007800), and cannot be misread. docs/NAMING.md's collision guards
-- exist for exactly this.
--
-- ── WHAT IT SAYS ────────────────────────────────────────────────────────────────────────────────
-- The same three things `journey_plans.space_plan_id` says for a Journey and
-- `space_calendar_entries.published_event_id` says for an event (PROG-CAL3):
--   • WHICH Plan this Program was produced from — the back-link the Plan drawer reads;
--   • that the Plan reached Production, so the Workflow board can stop showing it under Planning;
--   • and, when the Plan's stage column disagrees, that the best-effort seam in
--     app/(main)/spaces/[slug]/settings/program/actions.ts failed and needs catching up. A swallowed
--     error is an invisible regression (AGENTS.md), so the lag is derivable rather than lost.
--
-- `on delete set null`, never cascade: archiving the team's planning record must never delete the
-- Program it produced. A Program whose Plan is gone is simply a Program again.
--
-- No RLS change. `topical_channels`' policies govern the ROW; this column adds no new read path, and
-- the write authority is above it — createSpaceProgramAction resolves the Plan through
-- `getSpacePlan`, which reads on the caller's own session so RLS on `space_plans` decides, and
-- refuses a Plan belonging to a different Space than the one the Program is being created for.
--
-- House style: additive + idempotent (SAFE to re-run). lib/database.types.ts is updated by hand in
-- the same change (ADR-246). Rollback:
--   alter table public.topical_channels drop column space_plan_id;

alter table public.topical_channels
  add column if not exists space_plan_id uuid references public.space_plans(id) on delete set null;

comment on column public.topical_channels.space_plan_id is
  'The Space Plan this Program was produced from (ADR-1386, PROG-CAL9). Named space_plan_id, not plan_id: a Program is a Channel whose template_id is its blueprint, and a bare plan_id beside id, template_id and owner_space_id would be misread. NULL for every Channel that is not a Program and for every Program built outside the Pencil / Planning / Production spine.';

-- For the BACK-LINK direction: "which Program did this Plan become". Partial on purpose — the rows
-- that matter are the non-NULL ones, and they are the rare ones.
create index if not exists topical_channels_space_plan_id_idx
  on public.topical_channels (space_plan_id)
  where space_plan_id is not null;

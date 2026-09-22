-- THE JOURNEY A PLAN BECAME (journey_plans.space_plan_id) — PROG-CAL8, ADR-1386.
--
-- ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────────────────────────
-- `space_plans.target_kind` has offered 'journey' since 2026-09-19, and the Plan board's "Make it a
-- Production" button rendered for those Plans. The button led nowhere twice over:
--   • it was built as `/journeys/new?space=${spaceId}` while that page resolves its `?space=` by
--     SLUG (`getVisibleSpaceBySlug`), so a UUID never matched and `redirect('/spaces')` fired. The
--     owner pressed Make it a Production and landed on the Spaces directory.
--   • and it carried `&plan=<id>` to a page that never declared `plan` in its searchParams, so even
--     a Journey that did get created held nothing of the Plan it came from.
-- The href is fixed in lib/calendar/plans.ts. This column is the other half: the place the answer
-- lives once the Journey exists.
--
-- ── WHY THE COLUMN IS `space_plan_id` AND NOT `plan_id` ─────────────────────────────────────────
-- 🔴 A JOURNEY *IS* A PLAN, in this schema. `journey_plans` IS the Journey table, and `plan_id`
-- already has a settled meaning on its children: `journey_plan_items.plan_id` and
-- `journey_plan_adoptions.plan_id` both point at a JOURNEY. A column called `plan_id` on
-- `journey_plans` itself would therefore read as "the journey this journey belongs to" to every
-- future reader, which is the opposite of what it holds. `space_plan_id` names the table it points
-- at and cannot be misread. docs/NAMING.md's collision guards exist for exactly this.
--
-- ── WHAT IT SAYS ────────────────────────────────────────────────────────────────────────────────
-- The same three things `space_calendar_entries.published_event_id` says for an event (PROG-CAL3):
--   • WHICH Plan this Journey was produced from — the back-link the Plan drawer reads;
--   • that the Plan reached Production, so the Workflow board can stop showing it under Planning;
--   • and, when the Plan's stage column disagrees, that the best-effort seam in
--     app/(main)/journeys/create-actions.ts failed and needs catching up. A swallowed error is an
--     invisible regression (AGENTS.md), so the lag is derivable rather than lost.
--
-- `on delete set null`, never cascade: archiving the team's planning record must never delete the
-- Journey it produced. A Journey whose Plan is gone is simply a Journey again.
--
-- No RLS change. `journey_plans`' policies govern the ROW; this column adds no new read path, and
-- the write authority is above it — app/(main)/journeys/create-actions.ts resolves the Plan through
-- `getSpacePlan`, which reads on the caller's own session so RLS on `space_plans` decides, and
-- refuses a Plan belonging to a different Space than the one the Journey is stamped to.
--
-- House style: additive + idempotent (SAFE to re-run). Reached untyped until lib/database.types.ts
-- regenerates (ADR-246). Rollback:
--   alter table public.journey_plans drop column space_plan_id;

alter table public.journey_plans
  add column if not exists space_plan_id uuid references public.space_plans(id) on delete set null;

comment on column public.journey_plans.space_plan_id is
  'The Space Plan this Journey was produced from (ADR-1386, PROG-CAL8). Named space_plan_id, not plan_id: journey_plans IS the Journey table and plan_id already means "the Journey" on its children. NULL for every Journey built outside the Pencil / Planning / Production spine.';

-- For the BACK-LINK direction: "which Journey did this Plan become". Partial on purpose — the rows
-- that matter are the non-NULL ones, and they are the rare ones.
create index if not exists journey_plans_space_plan_id_idx
  on public.journey_plans (space_plan_id)
  where space_plan_id is not null;

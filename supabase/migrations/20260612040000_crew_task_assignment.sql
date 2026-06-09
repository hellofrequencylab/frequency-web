-- =============================================================================
-- Crew-task assignment — circle-scoped, claimable tasks (BUILD-LIST P4.7).
--
-- WHY: lib/core/capabilities.ts already grants `task.volunteer` / `task.claim` to
-- paid active circle members when the circle has open tasks, but `openTaskCount`
-- was permanently 0 because crew_tasks had no notion of a circle or an assignee —
-- every task was a global catalogue entry anyone could complete. This adds the
-- minimal assignment model: a host creates a task FOR their circle, a paid active
-- member claims it, and completing it reuses the existing crew_completions flow
-- unchanged (a circle task is still just a crew_tasks row).
--
-- DESIGN — columns on crew_tasks, not a separate claim table:
--   • A circle task is a single unit of work held by AT MOST ONE member at a time
--     (1:1, current-state only — no claim history requirement), so a join table
--     would model a cardinality we don't have and put a JOIN on the hot
--     capability-resolution path (`openTaskCount` is computed on every
--     getCircleCapabilities call).
--   • Race-safe claiming falls out for free: a single
--     `UPDATE … SET assigned_to = me WHERE id = $task AND assigned_to IS NULL`
--     lets exactly one of two concurrent claimers win (row-level lock; the loser
--     matches 0 rows). A claim table would need a unique partial index plus
--     conflict handling to get the same guarantee.
--   • NULL circle_id = a GLOBAL catalogue task — today's seeded behavior, fully
--     unchanged. Global tasks are never claimable (CHECK below) and keep being
--     completed directly via crew_completions.
--
-- Columns:
--   circle_id   → the circle this task belongs to; NULL = global catalogue task.
--                 ON DELETE CASCADE: a circle's tasks die with the circle
--                 (completions survive — crew_completions only references task_id
--                 with no cascade, and zaps already awarded are facts).
--   assigned_to → the member currently holding the task; NULL = open/unclaimed.
--                 ON DELETE SET NULL: a deleted profile re-opens the task.
--   claimed_at  → when the current claim happened (cleared on release).
--
-- INDEXES: partial on circle_id (only circle-scoped rows — the global catalogue
-- stays out of the index) serving both "list this circle's tasks" and the
-- capability-path count "open tasks in circle X" (assigned_to IS NULL is a cheap
-- filter on the few rows per circle); partial on assigned_to for "my claimed
-- tasks" lookups.
--
-- RLS: unchanged on purpose. crew_tasks keeps its public SELECT (members must see
-- their circle's tasks; task names are not sensitive) and the legacy mentor-only
-- write policies. All NEW writes (create / claim / release / delete) go through
-- the service-role admin client in app/(main)/crew/circle-task-actions.ts, each
-- gated by the capability resolver (`circle.assignTask` for host actions,
-- `task.claim` for member claims) — capabilities are the authority, not RLS,
-- exactly like circle_challenge_adoptions (20260611000000).
-- =============================================================================

ALTER TABLE public.crew_tasks
  ADD COLUMN IF NOT EXISTS circle_id   uuid        REFERENCES public.circles  (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assigned_to uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at  timestamptz;

-- Global catalogue tasks (circle_id IS NULL) are never claimable — assignment is
-- a circle-scoped concept. Guards against a bug ever "claiming" a global task and
-- hiding it from the catalogue.
ALTER TABLE public.crew_tasks
  DROP CONSTRAINT IF EXISTS crew_tasks_global_tasks_unassigned;
ALTER TABLE public.crew_tasks
  ADD CONSTRAINT crew_tasks_global_tasks_unassigned
  CHECK (assigned_to IS NULL OR circle_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_crew_tasks_circle
  ON public.crew_tasks (circle_id)
  WHERE circle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crew_tasks_assigned_to
  ON public.crew_tasks (assigned_to)
  WHERE assigned_to IS NOT NULL;

COMMENT ON COLUMN public.crew_tasks.circle_id IS
  'Circle this task belongs to; NULL = global catalogue task (original behavior). Circle tasks are created by the circle''s host (circle.assignTask) and claimable by paid active members (task.claim).';
COMMENT ON COLUMN public.crew_tasks.assigned_to IS
  'Member currently holding this circle task; NULL = open. Claims are race-safe: UPDATE … WHERE assigned_to IS NULL. Always NULL for global tasks (CHECK).';
COMMENT ON COLUMN public.crew_tasks.claimed_at IS
  'When the current claim was made; cleared when the task is released.';

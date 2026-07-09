-- =============================================================================
-- Practice-timer rework, schema 1/1: a CREATOR-authored warm-up on practices
-- (message + length), shown during the timer pre-roll (docs/PRACTICE-TIMER-REWORK.md,
-- Phase 0; ADR-592).
--
-- WHY: today the warm-up is a MEMBER-only pre-roll countdown (3/5/10s, profiles.meta
-- .onAir.warmupSec) with no words. The creator of a practice needs to author a short
-- message that shows on screen during that warm-up, and optionally set the warm-up
-- length so it ships preset. Both columns are NULLABLE and additive:
--   * warmup_message NULL/empty -> today's behavior (a silent pre-roll, no message).
--   * warmup_sec     NULL       -> use the member's personal pre-roll length
--                                  (profiles.meta.onAir.warmupSec, default 5s). A set
--                                  value seeds/overrides the pre-roll default.
-- The pre-roll UI (components/on-air/session.tsx + movement-session.tsx) reads these
-- when a timed practice launches; a null/empty pair is indistinguishable from the
-- pre-rework behavior, so legacy rows need no backfill.
--
-- This is the ONLY migration the rework needs. The full workout preset (Phase 2), the
-- card preview (Phase 4), and the Journey/Run timer override (Phase 5) all reuse
-- existing schema (practices.movement_config jsonb; journey_plan_items.settings jsonb).
--
-- NOTE: regenerate lib/database.types.ts after apply (the integrator's step). Until then
-- lib/practices.ts reaches warmup_message / warmup_sec through its untyped admin handle
-- (ADR-246 untyped casts).
-- =============================================================================

-- The columns. Both nullable + additive; no backfill needed.
alter table public.practices
  add column if not exists warmup_message text;

alter table public.practices
  add column if not exists warmup_sec integer;

comment on column public.practices.warmup_message is
  'Creator-authored message shown on screen during the timer pre-roll (the warm-up), for a timed practice. Plain, voice-compliant (docs/CONTENT-VOICE.md), <= ~140 chars (enforced in app code). NULL/empty = a silent pre-roll (the pre-rework behavior). Applies across timer_kind mindless + movement.';
comment on column public.practices.warmup_sec is
  'Creator''s recommended warm-up (pre-roll) length in seconds for a timed practice. NULL = use the member''s personal pre-roll length (profiles.meta.onAir.warmupSec, default 5). When set, it seeds/overrides the pre-roll default. Clamped to a sane band in app code.';

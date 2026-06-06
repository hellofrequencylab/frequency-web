-- =============================================================================
-- Journey identity fields for the Studio builder (ADR-142)
--
-- The Journeys builder lets a member give their life-development track a face and
-- a voice without hosting an image: a quick emoji + accent color, and a longer
-- "why this journey" intro (markdown) that scales a plan from a single meditation
-- practice up to a full course. All optional + additive. cover_image (already
-- present) stays for power users who want a real image.
-- =============================================================================

alter table public.journey_plans
  add column if not exists intro  text,
  add column if not exists emoji  text,
  add column if not exists accent text;

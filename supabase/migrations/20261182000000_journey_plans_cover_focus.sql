-- Per-Journey HEADER (hero) FOCAL POINT — a CSS object-position ("x% y%") so the cover keeps its
-- subject in frame inside the cropped PageHero window. Additive + optional; NULL === centered
-- ("50% 50%"), so every existing Journey renders exactly as today. Mirrors the profile header focal
-- (profiles.meta.headerFocal) and the Space cover focus, but as a dedicated column because
-- journey_plans has no general-purpose jsonb bag (page_config/meeting are purpose-typed).
alter table public.journey_plans
  add column if not exists cover_focus text;

comment on column public.journey_plans.cover_focus is
  'Hero cover focal point as a CSS object-position ("x% y%"). NULL = centered.';

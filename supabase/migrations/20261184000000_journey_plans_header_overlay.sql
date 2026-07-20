-- Journey header overlay (ADR-794 unified None/Shade/Blend control, editable per Journey). Standardizes
-- the overlay control across Spaces, Journeys, and Profiles. Style is 'none' | 'shadow' | 'fade' (labeled
-- None / Shade / Blend in the UI); color is an optional hex the operator picked for shade/fade. Null = the
-- surface default (shadow), so this is additive and back-compatible.
alter table public.journey_plans
  add column if not exists header_overlay_style text,
  add column if not exists header_overlay_color text;

comment on column public.journey_plans.header_overlay_style is
  'Journey header overlay style: none | shadow | fade (labeled None/Shade/Blend). Null = surface default.';
comment on column public.journey_plans.header_overlay_color is
  'Optional hex color for the shadow/fade overlay. Null = the token default (ink for shadow, canvas for fade).';

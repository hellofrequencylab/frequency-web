-- Journey header logo/profile image (owner directive: a Journey header carries cover + logo + icon,
-- matching Spaces and Profiles). A square logo/profile image URL shown as the header's leading chip
-- beside the icon. Null = icon only (the existing look), so this is additive and back-compatible.
alter table public.journey_plans
  add column if not exists logo_image text;

comment on column public.journey_plans.logo_image is
  'Square logo/profile image URL shown as the Journey header''s leading chip beside the icon. Null = icon only.';

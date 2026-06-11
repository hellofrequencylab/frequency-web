-- Vera's avatar: the on-brand sparkle (public/vera-avatar.png, baked from SVG via
-- scripts/gen-vera-avatar.mts because next/image doesn't optimize SVG). Served as a
-- local public asset, so no storage upload or remote image pattern is required.
update public.profiles
set avatar_url = '/vera-avatar.png'
where is_system = true;

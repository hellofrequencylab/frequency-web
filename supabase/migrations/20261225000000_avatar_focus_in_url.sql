-- Avatar focal point rides the stored URL (ADR-829).
-- The member's chosen avatar crop lives on profiles.meta.avatarFocal, but most render
-- surfaces only ever select avatar_url. The focus is now mirrored into the URL itself as
-- a `#fp=<x>,<y>` fragment (see lib/images/avatar-focus.ts) so every loader that already
-- carries avatar_url carries the crop for free — a fragment never goes over the wire, so
-- storage/CDN behavior is unchanged. New writes mirror it in the profile save actions;
-- this backfills members who picked a focus before the URL carried it.
update public.profiles
set avatar_url = split_part(avatar_url, '#', 1) || '#fp=' ||
  replace(replace(meta->>'avatarFocal', '% ', ','), '%', '')
where avatar_url is not null
  and avatar_url <> ''
  and coalesce(meta->>'avatarFocal', '') ~ '^\d{1,3}% \d{1,3}%$';

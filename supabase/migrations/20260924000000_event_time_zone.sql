-- Per-event IANA timezone (TZ-01).
--
-- Events store starts_at/ends_at as the host's wall-clock kept in UTC PARTS
-- (7:00 PM -> 19:00:00Z), historically interpreted as America/Los_Angeles. This adds
-- an explicit zone per event so an event geolocated to another city (New York, London)
-- renders and gates in ITS OWN zone, while HOME (LA) stays the default.
--
-- Additive + non-destructive: no existing timestamp is rewritten. Existing rows default
-- to HOME, which exactly matches the prior implicit assumption, so behavior is unchanged
-- for them. New/edited events get their real zone computed in code from coordinates
-- (lib/time/zone.ts tzFromLatLng, via tz-lookup) and written here.

alter table public.events
  add column if not exists time_zone text not null default 'America/Los_Angeles';

comment on column public.events.time_zone is
  'IANA timezone the event''s wall-clock starts_at/ends_at are in (default America/Los_Angeles = HOME). Set from the event coordinates at save time; see lib/time/zone.ts.';

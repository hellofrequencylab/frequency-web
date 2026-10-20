-- A Space's street address is private until its owner says otherwise (LIVE-947, ADR-1786).
--
-- spaces.location_precision defaulted to 'exact' (20270301000000_space_location.sql), on the argument
-- that a Space has no published location until its owner places a pin. That held for the map, but the
-- owner was never asked: the first pin they saved published the street. The default is now
-- 'approximate': the street and ZIP are withheld and the map draws a ~1 km cell. An owner who wants
-- people to walk through the door picks "Show my exact spot" in the location form.
--
-- Two changes, both additive and idempotent:
--   1. The column default becomes 'approximate' for every Space created from now on.
--   2. A Space that has NO pin yet and still holds the old default flips to 'approximate'. Nothing is
--      published for it, nobody chose 'exact', so the flip changes no visible page. A Space WITH a pin
--      keeps whatever it holds: exact may be a choice, and this migration never narrows a live listing.

alter table public.spaces
  alter column location_precision set default 'approximate';

update public.spaces
   set location_precision = 'approximate'
 where location_precision = 'exact'
   and latitude is null
   and longitude is null;

comment on column public.spaces.location_precision is
  'How precisely this Space allows its location to be published. approximate (the default, LIVE-947) = the street and ZIP are withheld and the read path snaps the pin to a ~1 km grid cell first (lib/maps/approximate.ts). exact = the pin and street publish as placed, an owner choice in the location form. Reading an unrecognised value still resolves to exact (lib/spaces/location.ts resolvePrecision), deliberately.';

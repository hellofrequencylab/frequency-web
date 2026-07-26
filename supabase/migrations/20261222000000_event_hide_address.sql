-- HIDE ADDRESS UNTIL REGISTERED (ADR-825). Owner directive: an event's address can be hidden
-- until someone registers. When true, the public event page shows CITY-LEVEL location only
-- (city / region) with an honest "the address is shared after you RSVP" note; the exact venue
-- (venue_name / street / postal code), the maps deep link, and the precise map pin render only
-- for a REGISTERED viewer (a going/waitlist RSVP or a ticket) or an event manager.
--
-- The public /discover surface is already city-level only by contract (ADR-186) and the event
-- JSON-LD never carried the venue, so the event page is the single enforcement point.

alter table public.events
  add column if not exists hide_address boolean not null default false;

comment on column public.events.hide_address is
  'ADR-825: when true, the exact address (venue/street/pin/maps link) renders only for registered viewers (going/waitlist RSVP or ticket) and managers; everyone else sees city-level location with a share-after-RSVP note.';

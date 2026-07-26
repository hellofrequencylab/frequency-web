-- JOIN MODE (ADR-826 follow-up). Owner directive: an event shows ONE join function, never both —
-- either RSVP (first come, first served; any pricing is informational or at the door) or Tickets
-- (buying is how you attend; members buy at their member rate via a members-only tier).
--
--   'auto'    — derive from pricing (the pre-existing behavior): priced + ticketing on → tickets,
--               else rsvp. Every existing event keeps behaving exactly as before.
--   'rsvp'    — the RSVP switch for everyone (first come, first served). Ticket tiers render as
--               an informational price list (no buy button).
--   'tickets' — the ticket flow only; no RSVP switch (your ticket is your answer).

alter table public.events
  add column if not exists join_mode text not null default 'auto'
    check (join_mode in ('auto', 'rsvp', 'tickets'));

comment on column public.events.join_mode is
  'ADR-826: how people join — auto (derive from pricing), rsvp (first come first served; prices informational), tickets (buying is attending; no RSVP switch).';

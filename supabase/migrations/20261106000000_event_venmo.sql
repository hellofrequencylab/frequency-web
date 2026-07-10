-- Venmo handle for priced events while platform ticket sales are off
-- (lib/events/ticketing TICKETING_ENABLED=false): the host's handle, shown
-- next to the price on the event page so guests can pay the host directly.
-- Additive and nullable; hidden once real checkout turns back on.
alter table public.events
  add column if not exists venmo_handle text;

comment on column public.events.venmo_handle is
  'Host''s Venmo handle (stored without the @). Shown near the ticket price while platform payments are off; the app sanitizes to [A-Za-z0-9_-].';

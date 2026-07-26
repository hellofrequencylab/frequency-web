-- EVENT DISPATCH EMAIL CHANNEL (ADR-255 follow-up, owner directive 2026-07-26): a host update
-- can go on the event wall AND out to the guest list by email in one post. Records the channel
-- choice next to to_page / to_dispatch / to_sms; the send itself rides the 'dispatches' email
-- preference + suppression per guest (lib/events/dispatch.ts fanOutEventEmail).

alter table public.event_dispatches
  add column if not exists to_email boolean not null default false;

comment on column public.event_dispatches.to_email is
  'ADR-255 email channel: this update was also emailed to the guest list (per-guest dispatches email preference + suppression enforced at send).';

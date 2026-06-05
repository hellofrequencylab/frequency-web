-- QR "3 wins": action destinations + time-aware switching (issue #221).
--   • circle → one-tap join on scan (destination_type='circle' + circle_id)
--   • event  → RSVP + verified-practice check-in on scan ('event' + event_id)
--   • time-aware → a 'url' code resolves to alt_target_url once now() ≥ switch_at
-- All ADDITIVE; existing codes unaffected. Regenerate types after.

alter table public.qr_codes drop constraint if exists qr_codes_destination_type_check;
alter table public.qr_codes add constraint qr_codes_destination_type_check
  check (destination_type in ('url', 'node', 'action', 'circle', 'event'));

alter table public.qr_codes add column if not exists circle_id      uuid references public.circles(id) on delete set null;
alter table public.qr_codes add column if not exists event_id       uuid references public.events(id)  on delete set null;
alter table public.qr_codes add column if not exists switch_at      timestamptz;
alter table public.qr_codes add column if not exists alt_target_url text;

comment on column public.qr_codes.switch_at is
  'Time-aware destination: after this moment a url code resolves to alt_target_url. See issue #221.';

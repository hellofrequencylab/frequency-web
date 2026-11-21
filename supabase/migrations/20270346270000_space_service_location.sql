-- BOOK-010 (Space booking audit, 2026-11-21): a service says WHERE it happens. Before this a booker
-- never learned the address to go to or the link to join: space_service_types had no location and no
-- email, reminder or calendar invite carried one. Calendly's most used event-type field.
--
--   location_kind   in_person | phone | video | null (null = not set, nothing is shown)
--   location_value  the address, the phone number, or the meeting link, as the owner typed it
--
-- Additive and idempotent. Code is FAIL-SOFT without it (lib/spaces/booking.ts and
-- lib/spaces/booking-notify.ts read the base columns when these are absent), so the app runs the same
-- before and after apply. Access is unchanged: RLS on, service-role reads and writes only (20261146000000).

alter table public.space_service_types
  add column if not exists location_kind text,
  add column if not exists location_value text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'space_service_types_location_kind_check'
      and conrelid = 'public.space_service_types'::regclass
  ) then
    alter table public.space_service_types
      add constraint space_service_types_location_kind_check
      check (location_kind is null or location_kind in ('in_person', 'phone', 'video'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'space_service_types_location_value_len'
      and conrelid = 'public.space_service_types'::regclass
  ) then
    alter table public.space_service_types
      add constraint space_service_types_location_value_len
      check (location_value is null or char_length(location_value) <= 500);
  end if;
end $$;

comment on column public.space_service_types.location_kind is
  'Where the service happens (BOOK-010): in_person, phone or video. Null shows nothing.';
comment on column public.space_service_types.location_value is
  'The address, phone number or meeting link for location_kind (BOOK-010), at most 500 characters. Sent in the confirmation, the reminder and the calendar invite LOCATION.';

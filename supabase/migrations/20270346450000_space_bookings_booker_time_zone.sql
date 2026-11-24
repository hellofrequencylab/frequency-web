-- BOOK-009 (Space booking audit, 2026-11-21): booking emails state the time in the booker's own zone.
-- The picker shows times in the viewer's zone, but every email formatted in the Space's zone, so a
-- booker in New York read "Tue 9:00 AM PST". The browser now reports its zone with the booking; it is
-- stored here and used for the booker's confirmation, reminder and cancellation. The owner's emails keep
-- the Space's zone.
--
-- A reschedule that does not report a zone (an owner moving a booking) keeps the old booking's, copied
-- by the BOOK-004 chain trigger, so a moved booking never loses the booker's zone.
--
-- Additive and nullable. The app is FAIL-SOFT without it (the insert retries without the column and the
-- email read treats an error as no zone), so the app runs the same before and after apply.

alter table public.space_bookings
  add column if not exists booker_time_zone text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'space_bookings_booker_time_zone_len'
      and conrelid = 'public.space_bookings'::regclass
  ) then
    alter table public.space_bookings
      add constraint space_bookings_booker_time_zone_len
      check (booker_time_zone is null or char_length(booker_time_zone) between 1 and 64);
  end if;
end $$;

create or replace function public.space_bookings_set_chain_id()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prev_chain uuid;
  prev_zone text;
begin
  if new.rescheduled_from is not null then
    select b.chain_id, b.booker_time_zone into prev_chain, prev_zone
    from public.space_bookings b where b.id = new.rescheduled_from;
    new.chain_id := coalesce(new.chain_id, prev_chain);
    new.booker_time_zone := coalesce(new.booker_time_zone, prev_zone);
  end if;
  new.chain_id := coalesce(new.chain_id, new.id);
  return new;
end
$$;

revoke execute on function public.space_bookings_set_chain_id() from public, anon, authenticated;

comment on column public.space_bookings.booker_time_zone is
  'BOOK-009: the IANA zone the booker''s browser reported (at most 64 characters). The booker''s confirmation, reminder and cancellation state the time in it; the owner''s keep the Space''s zone. A reschedule without one keeps the old booking''s.';

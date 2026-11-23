-- BOOK-004 (Space booking audit, 2026-11-21): the database refuses two live bookings whose times
-- overlap, not only two that start at the same instant. The old guard was the unique index
-- space_bookings_one_active_per_slot on (space_id, starts_at); overlap with a different start was
-- checked only in app code after a read, so two bookers racing (a 60 minute service at 10:00 and a
-- 30 minute one at 10:30) could both insert.
--
-- A reschedule inserts the new booking BEFORE it cancels the old one (lib/spaces/booking.ts and
-- lib/spaces/booking-guest-manage.ts), so the old time is never freed by a failed move. The new
-- time may overlap the old one (moving 30 minutes later), so the two must not refuse each other.
-- chain_id carries that: a booking's chain is its own id, or the chain of the booking it was
-- rescheduled from (set by trigger, so every writer gets it). The exclusion constraint refuses an
-- overlap only between bookings of DIFFERENT chains. Buffers stay an app rule.
--
-- Additive. Prod had 0 bookings and 0 overlapping live pairs on 2026-11-23. App code needs no change:
-- any insert error already reads as "That time was just taken. Pick another."

create extension if not exists btree_gist with schema extensions;

alter table public.space_bookings add column if not exists chain_id uuid;
update public.space_bookings set chain_id = id where chain_id is null;

create or replace function public.space_bookings_set_chain_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.rescheduled_from is not null then
    select b.chain_id into new.chain_id from public.space_bookings b where b.id = new.rescheduled_from;
  end if;
  new.chain_id := coalesce(new.chain_id, new.id);
  return new;
end
$$;

revoke execute on function public.space_bookings_set_chain_id() from public, anon, authenticated;

drop trigger if exists space_bookings_set_chain_id on public.space_bookings;
create trigger space_bookings_set_chain_id
  before insert on public.space_bookings
  for each row execute function public.space_bookings_set_chain_id();

alter table public.space_bookings alter column chain_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'space_bookings_no_overlap'
      and conrelid = 'public.space_bookings'::regclass
  ) then
    alter table public.space_bookings
      add constraint space_bookings_no_overlap
      exclude using gist (
        space_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&,
        chain_id with <>
      ) where (status in ('confirmed', 'pending'));
  end if;
end $$;

comment on column public.space_bookings.chain_id is
  'BOOK-004: the booking''s own id, or the chain of the booking it was rescheduled from. A reschedule may overlap its own chain while the old booking is still live; any other overlap is refused by space_bookings_no_overlap.';

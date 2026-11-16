-- FH-036S: the Experience Pass purchase snapshot, kept on the ticket it was bought with.
--
-- A ticket tier bound to a Hunt pass sells through the ordinary Event ticket checkout. When that checkout
-- reserves the seat it writes ONE jsonb value here: the frozen binding the purchase was made under
-- (binding id and revision, Hunt, version, seller, benefit codes), the canonical unit price and total, the
-- quantity and what the buyer was actually charged. Settlement reads it back and refuses to project a Hunt
-- benefit for a ticket that no longer matches it (lib/hunts/pass-binding.ts verifySettledPurchase).
--
-- NULL for every ordinary ticket, which is every ticket that exists today, so nothing about a ticket that
-- is not a pass changes. No new policy and no new grant: event_tickets keeps its row level security, a
-- browser role still cannot insert, update or delete a ticket, and the service role is the only writer.
-- The value names ids and benefit codes only, never a person or a card.
-- Additive and idempotent.

begin;

alter table public.event_tickets add column if not exists hunt_pass jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_tickets_hunt_pass_object') then
    alter table public.event_tickets
      add constraint event_tickets_hunt_pass_object
      check (hunt_pass is null or (jsonb_typeof(hunt_pass) = 'object' and hunt_pass ? 'snapshot' and pg_column_size(hunt_pass) <= 4096));
  end if;
end $$;

comment on column public.event_tickets.hunt_pass is
  'FH-036S: the Experience Pass purchase snapshot written at checkout creation. NULL for an ordinary ticket.';

commit;

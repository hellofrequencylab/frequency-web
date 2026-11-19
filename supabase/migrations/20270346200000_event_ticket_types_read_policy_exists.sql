-- PERF-018: reading a ticket tier asks about ONE event, not every event.
--
-- THE COST. The read policy on event_ticket_types was `event_id in (select events.id from
-- public.events)` (20260610010000). Under a caller role that subquery runs every events policy over
-- EVERY event to build the list, then checks one id against it, so each tier read costs more with
-- each new event: 18.7 ms per read at 531 events. It is the busiest statement in
-- pg_stat_statements (558,482 calls, 32.9 ms mean, about five hours of database time, read
-- 2026-11-19).
--
-- THE FIX. The correlated EXISTS form asks the same question of the one event by primary key:
-- measured 18.19 ms to 0.63 ms as anon on a copy of the table, same rows. Visibility is unchanged,
-- because both forms read public.events under the caller's own RLS: a tier is readable exactly when
-- its event is. Writes stay service-role only (no insert, update or delete policy).
--
-- ROLLBACK: recreate the policy with using (event_id in (select events.id from public.events)).

begin;
set local lock_timeout = '3s';

drop policy if exists "read tiers for visible events" on public.event_ticket_types;
create policy "read tiers for visible events" on public.event_ticket_types
  for select
  using (exists (select 1 from public.events ev where ev.id = event_ticket_types.event_id));

commit;

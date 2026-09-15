-- ticket_sales_window: WHEN a ticket may be bought, so "members get first RSVP" stops being a
-- promise kept by memory (ADR-1373).
--
-- Today a members-first window is achieved by an operator leaving the public ticket row inactive
-- and remembering to flip `active` on later. That is a reminder, not a rule: it silently fails on
-- every recurring event, because a fourteen-day series has fourteen chances to forget and no
-- record of what the promise was.
--
-- TWO SHAPES, ON PURPOSE. Standard ticketing platforms express this as an absolute sales start/end
-- per ticket type. Studios express it as a booking window per tier ("unlimited books 7 days out,
-- packs 5 days out"), which reserves peak capacity for the highest-value members. Both are here,
-- and the RELATIVE one is the one that matters most: an absolute date would have to be re-entered
-- for every occurrence of a recurring series, which is exactly the failure mode being removed.
--
-- 🔴 WHICH ONE WINS: `sales_start_at` (absolute) beats `sales_starts_days_before` (relative)
-- whenever both are set. The relative value is the SERIES rule, written once and inherited by every
-- occurrence; the absolute value is a per-occurrence override an operator typed for this date. If
-- the series rule won, the override would be unexpressible, and an operator who wanted to open one
-- night early would have no way to say so. The precedence lives in exactly one function,
-- `ticketSalesOpenAt` (lib/events/sales-window.ts), so no second call site can decide differently.
--
-- ADMISSION IS UNCHANGED. The ADR-823 gate (`space_members_only` / `space_tier_id`) decides WHO may
-- buy and the ADR-1372 benefits decide WHAT THEY PAY. This decides WHEN, and composes with both:
-- the checkout runs all three and any one of them can refuse.
--
-- ACCESS MODEL: unchanged from `event_ticket_types` itself. No new table, no new RLS surface, no new
-- policy. These are three nullable columns on a table whose writes already go through the
-- service-role admin client behind the `event.editSettings` capability, and whose reads are already
-- scoped by the existing SELECT policy. Nothing here widens what any client key can see or do.
--
-- House style (matches 20270345004800_space_member_benefits.sql): additive + idempotent, applied to
-- production via the Supabase SQL Editor; lib/database.types.ts is regenerated separately. SAFE to
-- re-run. Every existing row gets three NULLs, which reads as "no window, always on sale" — the
-- behaviour every production row has today.

alter table public.event_ticket_types
  -- The absolute open time. Wins over the relative day count when both are set.
  add column if not exists sales_start_at timestamptz,
  -- Opens this many days before the event starts. THE ONE THAT SURVIVES A RECURRING SERIES: it is
  -- written once and resolves against each occurrence's own start, so nothing is re-entered per
  -- date. 0 is meaningful (opens exactly at the event start) and is NOT the same as null.
  add column if not exists sales_starts_days_before integer
                           check (sales_starts_days_before is null or sales_starts_days_before >= 0),
  -- Optional close time, so a members window can also CLOSE rather than only open. Absolute only:
  -- a relative close would need a second rule for "how long after it opened" and nobody has asked
  -- for one, and an unused rule is a rule that rots.
  add column if not exists sales_end_at timestamptz;

comment on column public.event_ticket_types.sales_start_at is
  'Absolute time this ticket goes on sale (ADR-1373). null = no absolute open. WINS over sales_starts_days_before when both are set: the relative value is the series rule, this is the per-occurrence override.';
comment on column public.event_ticket_types.sales_starts_days_before is
  'Opens this many days before the event starts (ADR-1373). The shape that survives a recurring series: written once, resolved against each occurrence. 0 = opens at the event start, which is NOT the same as null (no window). LOSES to sales_start_at when both are set.';
comment on column public.event_ticket_types.sales_end_at is
  'Absolute time this ticket stops selling (ADR-1373). null = sells until the event ends. Lets a members-first window CLOSE as well as open.';

-- A window that ends before it opens can never fire, so it is a write-time mistake rather than a
-- state the app should be asked to render. Only the ABSOLUTE pair can be checked here: a relative
-- open time depends on events.starts_at, which SQL on this table cannot see, so the resolved
-- ordering is asserted in lib/events/sales-window.test.ts instead. Guarded rather than plain
-- `add constraint` so a re-run does not error on an already-present constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_types_sales_window'
  ) then
    alter table public.event_ticket_types
      add constraint event_ticket_types_sales_window
      check (sales_start_at is null or sales_end_at is null or sales_end_at > sales_start_at);
  end if;
end $$;

-- =============================================================================
-- VERIFICATION (after apply):
--  A. select sales_start_at, sales_starts_days_before, sales_end_at from public.event_ticket_types
--     limit 1;                                                    -> three NULL columns exist.
--  B. update public.event_ticket_types set sales_starts_days_before = -1 where id = <any>;
--                                                                 -> refused by the check.
--  C. update public.event_ticket_types
--       set sales_start_at = now(), sales_end_at = now() - interval '1 day' where id = <any>;
--                                                                 -> refused by event_ticket_types_sales_window.
--  D. re-running this whole file                                  -> no error, no duplicate constraint.
-- =============================================================================

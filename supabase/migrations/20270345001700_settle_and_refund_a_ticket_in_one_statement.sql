-- A settled ticket flipped in one request and moved `sold` in a SECOND one. LIVE-161 (ADR-1209).
--
-- lib/billing/tickets.ts settled a ticket like this, and unwound a refund the mirror way:
--
--     update event_tickets set status = 'succeeded' ...      -- request 1 (the money fact)
--       where stripe_checkout_session_id = ? and status = 'pending'
--     rpc adjust_ticket_sold(tier, +qty)                     -- request 2 (the display count)
--
-- Each half was individually safe. `adjust_ticket_sold` is `sold = greatest(0, sold + delta)`, so
-- two concurrent bumps cannot lose an increment, and the flip's `status = 'pending'` predicate
-- makes a redelivered webhook flip nothing and therefore bump nothing. The GAP BETWEEN THEM was
-- the hole: two round trips are two chances to stop. A crash, a timeout, a container recycled
-- between them, or an unavailable second call leaves the ticket sold and `sold` short forever, and
-- because the flip is exactly-once nothing ever re-enters to finish the job. The app grew a retry
-- and an error log around request 2 (L6-15) which made the drift VISIBLE; it could not make it
-- impossible, because no number of retries closes a window that exists between two statements.
--
-- WHAT THESE RPCs GUARANTEE THAT THE OLD PATH DID NOT:
--
--   * ONE TRANSACTION, ONE ROUND TRIP. The status flip and the `sold` move commit together or not
--     at all. There is no interval in which a ticket is succeeded and its tier has not counted it,
--     so the drift the retry loop existed to report cannot occur.
--   * THE BUMP IS DERIVED FROM THE ROWS THIS CALL ACTUALLY FLIPPED. `sold` moves by the summed qty
--     of the rows the very same statement returned, so a caller cannot bump for a ticket somebody
--     else settled. The old pair inferred the same thing correctly but across a gap.
--   * EXACTLY-ONCE SURVIVES CONCURRENCY, NOT JUST REDELIVERY. Two settles of one session race on
--     the ticket row; the loser's UPDATE finds no `pending` row, returns zero rows, and its `sold`
--     bump is over an empty set. The webhook and the success-redirect reconcile can arrive at the
--     same instant and the tier still counts the sale once.
--
-- Capacity is unaffected either way and always was: reserve_ticket_atomic (20260930000000) counts
-- event_tickets rows, not `sold`, so `sold` is a DERIVED display number and never authoritative.
-- The reconcile for any historical drift is still safe to run at any time:
--   update event_ticket_types t set sold = coalesce((select sum(qty) from event_tickets
--     where ticket_type_id = t.id and status = 'succeeded'), 0)
--
-- `adjust_ticket_sold` is deliberately LEFT IN PLACE (not dropped): it is the generic manual lever
-- and dropping a function these two supersede is a separate decision. It simply has no app caller.
--
-- One behaviour change, stated plainly: the settle writes the PaymentIntent id with `coalesce`, so
-- a session that arrives without one no longer ERASES a PaymentIntent already recorded on the row.
-- The old statement wrote the incoming value unconditionally, null included.
--
-- Safe to re-run (create or replace). No em or en dashes.
--
-- ROLLBACK:
--   drop function if exists public.settle_ticket_atomic(text, text);
--   drop function if exists public.refund_ticket_atomic(text);

-- ── Settle: pending -> succeeded, and the tier counts it, in one statement ────────────────────
create or replace function public.settle_ticket_atomic(_session_id text, _payment_intent_id text)
returns table (
  id                 uuid,
  event_id           uuid,
  ticket_type_id     uuid,
  qty                integer,
  entity_id          uuid,
  platform_fee_cents integer,
  buyer_profile_id   uuid,
  currency           text
)
language sql
security definer
set search_path to 'public'
as $function$
  with flipped as (
    update public.event_tickets t
       set status                   = 'succeeded',
           succeeded_at             = now(),
           -- coalesce, not a blind write: never erase a PaymentIntent we already hold.
           stripe_payment_intent_id = coalesce(_payment_intent_id, t.stripe_payment_intent_id)
     where t.stripe_checkout_session_id = _session_id
       and t.status = 'pending'
    returning t.id, t.event_id, t.ticket_type_id, t.qty, t.entity_id,
              t.platform_fee_cents, t.buyer_profile_id, t.currency
  ),
  bumped as (
    -- A data-modifying CTE runs exactly once and to completion whether or not the primary query
    -- reads it, so this executes on the SAME snapshot as the flip above. Zero flipped rows means
    -- the aggregate is empty and no tier is touched.
    update public.event_ticket_types tt
       set sold = greatest(0, tt.sold + agg.delta)
      from (
        select f.ticket_type_id as tier, sum(coalesce(f.qty, 1))::integer as delta
          from flipped f
         where f.ticket_type_id is not null
         group by f.ticket_type_id
      ) agg
     where tt.id = agg.tier
    returning tt.id
  )
  select f.id, f.event_id, f.ticket_type_id, f.qty, f.entity_id,
         f.platform_fee_cents, f.buyer_profile_id, f.currency
    from flipped f;
$function$;

revoke execute on function public.settle_ticket_atomic(text, text) from public, anon, authenticated;
grant execute on function public.settle_ticket_atomic(text, text) to service_role;

comment on function public.settle_ticket_atomic(text, text) is
  'Settles the ticket behind a paid Checkout session: flips pending -> succeeded and moves event_ticket_types.sold by the flipped qty in ONE transaction, returning the rows it flipped (empty on a redelivered event). Replaces the flip + adjust_ticket_sold pair, whose two round trips could leave a settled ticket uncounted. service_role only. LIVE-161.';

-- ── Refund: succeeded -> refunded, and the tier gives the seat back, in one statement ─────────
create or replace function public.refund_ticket_atomic(_payment_intent_id text)
returns table (
  id                 uuid,
  event_id           uuid,
  ticket_type_id     uuid,
  qty                integer,
  entity_id          uuid,
  platform_fee_cents integer,
  buyer_profile_id   uuid,
  currency           text
)
language sql
security definer
set search_path to 'public'
as $function$
  with flipped as (
    update public.event_tickets t
       set status       = 'refunded',
           refunded_at  = now()
     where t.stripe_payment_intent_id = _payment_intent_id
       and t.status = 'succeeded'
    returning t.id, t.event_id, t.ticket_type_id, t.qty, t.entity_id,
              t.platform_fee_cents, t.buyer_profile_id, t.currency
  ),
  unbumped as (
    update public.event_ticket_types tt
       -- greatest(0, ...) keeps the column's `sold >= 0` check true even against historical drift.
       set sold = greatest(0, tt.sold - agg.delta)
      from (
        select f.ticket_type_id as tier, sum(coalesce(f.qty, 1))::integer as delta
          from flipped f
         where f.ticket_type_id is not null
         group by f.ticket_type_id
      ) agg
     where tt.id = agg.tier
    returning tt.id
  )
  select f.id, f.event_id, f.ticket_type_id, f.qty, f.entity_id,
         f.platform_fee_cents, f.buyer_profile_id, f.currency
    from flipped f;
$function$;

revoke execute on function public.refund_ticket_atomic(text) from public, anon, authenticated;
grant execute on function public.refund_ticket_atomic(text) to service_role;

comment on function public.refund_ticket_atomic(text) is
  'Unwinds a fully refunded ticket: flips succeeded -> refunded and gives the qty back to event_ticket_types.sold in ONE transaction, returning the rows it flipped (empty on a redelivered charge.refunded). Mirror of settle_ticket_atomic. service_role only. LIVE-161.';

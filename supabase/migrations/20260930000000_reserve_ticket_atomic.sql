-- Phase C2: close the ticket oversell race with an atomic reservation RPC.
--
-- createTicketCheckout checked `quantity - sold` and then (after creating the Stripe session)
-- inserted the pending row — but `sold` only bumps at the webhook, so N concurrent buyers all
-- passed the check and all paid, overselling a capacity-bound tier. This RPC does the capacity
-- check + pending-row insert atomically under a per-tier advisory lock ("seats held during
-- checkout", 30-min window, owner-approved).
--
-- Committed capacity = paid (status='succeeded') + in-flight pending held within 30 min. It
-- counts succeeded rows DIRECTLY (not the `sold` column) so it's robust against the brief gap
-- between recordTicketFromSession flipping pending->succeeded and bumping `sold`. Abandoned
-- pending rows fall out of the window (matching the 30-min Stripe session expiry), freeing seats.
-- Flat-price legacy path (no tier) has no per-tier cap — just records the pending row.
--
-- SECURITY DEFINER, pinned search_path, service_role only. Returns jsonb { reserved, reason? }.

create or replace function public.reserve_ticket_atomic(
  _tier_id      uuid,
  _event_id     uuid,
  _buyer        uuid,
  _qty          integer,
  _amount_cents integer,
  _fee_cents    integer,
  _currency     text,
  _session_id   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quantity  integer;
  v_committed integer;
begin
  if _qty is null or _qty <= 0 then
    return jsonb_build_object('reserved', false, 'reason', 'invalid_qty');
  end if;

  if _tier_id is null then
    -- Legacy flat-price path: no per-tier capacity, just record the pending row.
    insert into public.event_tickets
      (event_id, buyer_profile_id, ticket_type_id, qty, amount_cents, platform_fee_cents, currency, status, stripe_checkout_session_id)
    values (_event_id, _buyer, null, _qty, _amount_cents, _fee_cents, coalesce(_currency, 'usd'), 'pending', _session_id);
    return jsonb_build_object('reserved', true);
  end if;

  -- Serialize reservations for this tier: concurrent buyers block here so the capacity read +
  -- insert below are atomic and can't both pass the check for the same last seats.
  perform pg_advisory_xact_lock(hashtextextended(_tier_id::text, 0));

  select quantity into v_quantity from public.event_ticket_types where id = _tier_id;

  if v_quantity is not null then
    select coalesce(sum(qty), 0) into v_committed
    from public.event_tickets
    where ticket_type_id = _tier_id
      and (status = 'succeeded'
           or (status = 'pending' and created_at > now() - interval '30 minutes'));

    if v_committed + _qty > v_quantity then
      return jsonb_build_object('reserved', false, 'reason', 'sold_out');
    end if;
  end if;

  insert into public.event_tickets
    (event_id, buyer_profile_id, ticket_type_id, qty, amount_cents, platform_fee_cents, currency, status, stripe_checkout_session_id)
  values (_event_id, _buyer, _tier_id, _qty, _amount_cents, _fee_cents, coalesce(_currency, 'usd'), 'pending', _session_id);

  return jsonb_build_object('reserved', true);
end;
$$;

revoke all on function public.reserve_ticket_atomic(uuid, uuid, uuid, integer, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.reserve_ticket_atomic(uuid, uuid, uuid, integer, integer, integer, text, text) to service_role;

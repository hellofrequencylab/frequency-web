-- Stripe subscription event-ordering guard (member Crew/Supporter path only).
--
-- PROBLEM. Stripe does not guarantee webhook delivery order. A delayed
-- customer.subscription.updated(status=active) that Stripe CREATED before a
-- customer.subscription.deleted can be DELIVERED after it, so the current
-- unconditional profiles.membership_tier write re-grants a canceled tier and the member
-- keeps paid access for free. checkout.session.completed has the same hazard (a very
-- delayed original-signup event landing after a later cancel).
--
-- GUARD. Stamp the member profile with the Stripe event.created of the last APPLIED
-- membership event (last_stripe_event_at). Only apply an event whose created timestamp
-- is strictly greater. Strict > protects the dangerous direction the bug names: a stale
-- (older-or-equal) active can never overwrite a newer cancel. This RPC does the
-- read-compare-write ATOMICALLY under a per-profile advisory xact lock so two concurrent
-- webhook deliveries for the same member cannot both pass the check and race the write
-- (same model as award_gems_atomic / reserve_ticket_atomic).
--
-- Per-profile is a valid per-subscription key here: a member holds at most one personal
-- Crew/Supporter subscription at a time, Stripe event.created is globally monotonic (a
-- resubscribe's created is later than the prior cancel), and Space subscription events
-- never reach this path (routeSpaceSubscription returns before setTier).
--
-- House style: additive + idempotent (add column if not exists, create or replace),
-- expand-only, RLS unchanged. The new column is reached untyped from app code until
-- lib/database.types.ts regenerates (ADR-246). No en/em dashes.

-- 1. profiles.last_stripe_event_at: the created time of the last APPLIED member billing event.
alter table public.profiles
  add column if not exists last_stripe_event_at timestamptz;
comment on column public.profiles.last_stripe_event_at is
  'Stripe event.created of the last APPLIED member Crew/Supporter billing event (ordering guard). apply_membership_event_atomic ignores any event with created <= this so an out-of-order delayed active can never re-grant a canceled tier. NULL = no event applied yet. Written only by the gated member webhook; inert while billing_live is OFF.';

-- 2. apply_membership_event_atomic: ordering-guarded, atomic entitlement write.
create or replace function public.apply_membership_event_atomic(
  _profile         uuid,
  _event_at        timestamptz,
  _tier            text,
  _payment_status  text default null,
  _is_supporter    boolean default null,
  _customer_id     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
begin
  if _profile is null or _event_at is null then
    return jsonb_build_object('applied', false, 'reason', 'invalid_args');
  end if;

  -- Serialize concurrent member webhook deliveries so the read of last_stripe_event_at
  -- and the conditional write below are atomic (no check-then-write race).
  perform pg_advisory_xact_lock(hashtextextended(_profile::text, 0));

  select last_stripe_event_at into v_last from public.profiles where id = _profile;

  -- Ordering guard. Strict > : an event Stripe created at-or-before the last applied one
  -- is stale (an out-of-order redelivery) and is ignored, so a delayed active cannot undo
  -- a newer cancel.
  if v_last is not null and _event_at <= v_last then
    return jsonb_build_object('applied', false, 'reason', 'stale', 'last', v_last);
  end if;

  -- coalesce mirrors the prior setTier semantics exactly: tier always written; the
  -- supporter badge only set true (never cleared); customer id only overwritten when
  -- present; payment status written when provided; the guard timestamp always advanced.
  update public.profiles
  set membership_tier           = _tier,
      is_supporter              = coalesce(_is_supporter, is_supporter),
      stripe_customer_id        = coalesce(_customer_id, stripe_customer_id),
      membership_payment_status = coalesce(_payment_status, membership_payment_status),
      last_stripe_event_at      = _event_at
  where id = _profile;

  return jsonb_build_object('applied', true);
end;
$$;

-- Lock to service_role only. Supabase default-grants EXECUTE to anon + authenticated on
-- new public functions, so revoking from public alone is not enough.
revoke all on function public.apply_membership_event_atomic(uuid, timestamptz, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.apply_membership_event_atomic(uuid, timestamptz, text, text, boolean, text) to service_role;

-- ROLLBACK (manual):
--   drop function if exists public.apply_membership_event_atomic(uuid, timestamptz, text, text, boolean, text);
--   alter table public.profiles drop column if exists last_stripe_event_at;

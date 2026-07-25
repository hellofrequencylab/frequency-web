-- Space-plan webhook event-ordering guard (meta-scan 2026-07-25). The MEMBER tier path already
-- ignores a stale Stripe event via apply_membership_event_atomic (ADR-494, profiles.last_stripe_event_at);
-- the SPACE plan path (reconcileSpacePlanSubscription) had no equivalent, so a late-delivered OLDER
-- customer.subscription.* event (distinct event id, so the id-claim idempotency can't catch it) could
-- set-to-target the space's plan / add-ons / seat count back to stale values. Stripe does not guarantee
-- delivery order.
--
-- The guard is ONE conditional UPDATE (atomic, no lock juggling): claim_space_plan_event stamps
-- spaces.last_plan_event_at with the event's `created` iff it is strictly newer than the stored mark.
-- A stale event fails the WHERE, returns no row, and the webhook skips the reconcile. Scoped to the
-- space_plan kind only: a space has ONE plan subscription, so a single per-space watermark is correct.
-- (space_membership events are per-member and must NOT share this watermark; their ordering guard, if
-- ever needed, is a per-membership mark.)
--
-- SECURITY DEFINER + service_role-only EXECUTE (the 20261005 lockdown pattern): only the webhook's
-- admin client may call it. Additive + idempotent. Reversible: drop function + column.

alter table public.spaces
  add column if not exists last_plan_event_at timestamptz;

comment on column public.spaces.last_plan_event_at is
  'The Stripe event.created of the newest space_plan subscription event applied to this space (the ordering watermark; claim_space_plan_event). NULL = no event applied yet.';

create or replace function public.claim_space_plan_event(_space_id uuid, _event_created timestamptz)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.spaces
     set last_plan_event_at = _event_created
   where id = _space_id
     and (last_plan_event_at is null or last_plan_event_at < _event_created)
  returning true;
$$;

comment on function public.claim_space_plan_event(uuid, timestamptz) is
  'Atomically claim a space_plan Stripe event for reconciliation: stamps spaces.last_plan_event_at iff the event is strictly newer. Returns true on claim; no row (null) for a stale event, which the webhook skips. Service-role only.';

revoke execute on function public.claim_space_plan_event(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_space_plan_event(uuid, timestamptz) to service_role;

-- ============================================================================
-- HOUSEHOLD / CIRCLE BUNDLE SEATING: the atomic write behind the paid multi-seat bundle
-- (ADR-370 · REMAINING-WORK #6 · builds on 20260727000000_pricing_deferred_gates.sql).
--
-- WHAT A BUNDLE IS. ONE paid Stripe subscription held by the bundle OWNER (the payer)
-- that seats several members. A seat is a row in public.profiles pointing at the owner
-- through profiles.household_bundle_id (the self-FK added in 20260727000000); the owner
-- counts as a seat and points at themselves. The seat count and the member tier each seat
-- is granted come from the operator config (pricing_settings key 'household_bundle',
-- default 4 seats / crew) and are STAMPED INTO THE STRIPE SUBSCRIPTION METADATA at
-- checkout, so a later config edit can never re-price or re-size a bundle already sold.
--
-- WHY A FUNCTION RATHER THAN APP-SIDE UPDATES. Seating is a MULTI-ROW write: unseat who
-- left, seat who joined, re-assert the granted tier, advance the ordering stamp. Done as
-- four round trips from the webhook, a failure between any two leaves a paid buyer half
-- seated - some members holding the tier, some not, with no record of how far it got.
-- Inside one plpgsql function it is ONE transaction: it either seats the whole roster or
-- changes nothing, the webhook releases its idempotency claim, and Stripe redelivers.
-- Same model as apply_membership_event_atomic (20261003000000), award_gems_atomic and
-- reserve_ticket_atomic.
--
-- THE THREE THINGS THIS GETS RIGHT, each of which is a money bug if it is got wrong:
--
--   1. A REPLAY MUST NOT DOUBLE-SEAT. Stripe retries webhooks, and the same subscription
--      event can arrive more than once. Every write here is SET-TO-TARGET keyed by
--      profile id (not an increment, not an insert), and household_bundle_prior_tier is
--      recorded ONLY on the transition into the bundle. Running the same event twice
--      therefore lands on the identical rows. The event-ordering stamp
--      (profiles.household_bundle_event_at) rejects it before that as well.
--
--   2. AN OUT-OF-ORDER EVENT MUST NOT RE-SEAT A CANCELED BUNDLE. Stripe does not
--      guarantee delivery order, so a delayed `active` created BEFORE a `deleted` can be
--      delivered after it. Strict `>` against household_bundle_event_at drops it. This is
--      a SEPARATE stamp from profiles.last_stripe_event_at on purpose: a member can hold a
--      personal Crew subscription AND sit in someone else's bundle, and the two event
--      streams must not make each other look stale.
--
--   3. UNSEATING MUST NOT CANCEL A MEMBERSHIP THE PERSON PAYS FOR THEMSELVES. A seat is
--      restored to household_bundle_prior_tier (what they held when the bundle seated
--      them), and a profile whose own membership_payment_status is 'active' is never
--      lowered at all - that column is written only by the personal member webhook path,
--      so it is the honest signal for "this person is paying for their own membership".
--      Seating is likewise upgrade-only: a member who already holds a paid tier keeps it.
--
-- House style (matches the prior pricing migrations): additive + idempotent, expand-only,
-- `add column if not exists` / `create or replace`, RLS unchanged (no new table - the
-- columns ride public.profiles), grants closed to service_role only (ADR-964). The new
-- columns are reached from app code untyped until lib/database.types.ts regenerates
-- (ADR-246). SAFE to re-run.
--
-- INERT UNTIL SOLD. Nothing calls this until an operator sets Stripe env AND flips
-- `billing_live` AND `bundle_household_enabled` (all default OFF), so on an unflipped
-- platform every column stays NULL and the function is never invoked.
--
-- ROLLBACK (manual; this migration is never auto-reverted):
--   drop function if exists public.apply_bundle_seating_atomic(uuid, timestamptz, uuid[], text, integer, boolean, text);
--   alter table public.profiles drop column if exists household_bundle_prior_tier;
--   alter table public.profiles drop column if exists household_bundle_event_at;
-- ============================================================================

-- ── 1. profiles.household_bundle_prior_tier: what the seat held before the bundle ─────
-- Recorded at the moment a profile is seated, so unseating RESTORES rather than guesses.
-- Without it the only safe unseat is "set free", which silently downgrades a member who
-- already had a paid tier when they joined the bundle. NULL = not seated (everyone today).
alter table public.profiles
  add column if not exists household_bundle_prior_tier text;
comment on column public.profiles.household_bundle_prior_tier is
  'The membership_tier this profile held when a Household / Circle bundle seated it (ADR-370). Restored on unseat, so leaving a bundle never lowers a member below where they started. Written ONLY on the transition into a bundle (never on a replay), and cleared on unseat. NULL = not seated. Inert while billing_live is OFF.';

-- ── 2. profiles.household_bundle_event_at: the bundle event-ordering guard ────────────
-- Carried by the bundle OWNER's row (the bundle is keyed by its owner). Mirrors
-- profiles.last_stripe_event_at, deliberately as a SECOND column: a seated member may also
-- hold their own personal subscription, and one stream must never mark the other stale.
alter table public.profiles
  add column if not exists household_bundle_event_at timestamptz;
comment on column public.profiles.household_bundle_event_at is
  'Stripe event.created of the last APPLIED Household / Circle bundle event for the bundle this profile OWNS (ADR-370). apply_bundle_seating_atomic ignores any event created <= this, so an out-of-order delayed active can never re-seat a canceled bundle. Separate from last_stripe_event_at because a member can hold a personal subscription AND sit in a bundle. NULL = no bundle event applied. Inert while billing_live is OFF.';

-- ── 3. apply_bundle_seating_atomic: seat / unseat a whole bundle in ONE transaction ────
create or replace function public.apply_bundle_seating_atomic(
  _owner        uuid,
  _event_at     timestamptz,
  _seat_ids     uuid[],
  _tier         text,
  _seats        integer,
  _active       boolean,
  _customer_id  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last     timestamptz;
  v_exists   boolean;
  v_roster   uuid[];
  v_seated   integer := 0;
  v_unseated integer := 0;
begin
  if _owner is null or _event_at is null then
    return jsonb_build_object('applied', false, 'reason', 'invalid_args');
  end if;
  -- The granted tier comes from operator config, so it is validated here too: a bundle may
  -- only ever grant a MEMBER tier, never anything else that lands in the column.
  if _tier is null or _tier not in ('crew', 'supporter') then
    return jsonb_build_object('applied', false, 'reason', 'invalid_tier');
  end if;

  -- Serialize concurrent deliveries for THIS bundle so the read of the ordering stamp and
  -- the conditional writes below cannot interleave with another delivery's.
  perform pg_advisory_xact_lock(hashtextextended('household_bundle:' || _owner::text, 0));

  select true, household_bundle_event_at
    into v_exists, v_last
    from public.profiles
   where id = _owner;
  if not coalesce(v_exists, false) then
    -- The owner profile is gone (deleted between purchase and delivery). Nothing to seat,
    -- and reporting it as applied would hide a real orphan from the webhook's logs.
    return jsonb_build_object('applied', false, 'reason', 'no_owner');
  end if;

  -- Ordering guard. Strict > : an event Stripe created at-or-before the last applied one is
  -- a redelivery or an out-of-order straggler, and is dropped.
  if v_last is not null and _event_at <= v_last then
    return jsonb_build_object('applied', false, 'reason', 'stale', 'last', v_last);
  end if;

  if _active then
    -- The target roster: the owner first, then the seat ids stamped at checkout, keeping
    -- the first occurrence of each, dropping ids that are not real profiles, and capped at
    -- the seat count the bundle was BOUGHT with. Deterministic, so a replay computes the
    -- identical roster.
    with candidate as (
      select c.id, min(c.ord) as ord
        from unnest(array[_owner] || coalesce(_seat_ids, '{}'::uuid[])) with ordinality as c(id, ord)
       where exists (select 1 from public.profiles p where p.id = c.id)
       group by c.id
    ), capped as (
      select id, ord from candidate order by ord limit greatest(coalesce(_seats, 1), 1)
    )
    select coalesce(array_agg(id order by ord), '{}'::uuid[]) into v_roster from capped;

    -- 3a. Unseat whoever is in this bundle but off the new roster (the owner dropped them,
    --     or the seat count shrank). Restore what they held; never lower someone who is
    --     paying for their own membership.
    update public.profiles
       set membership_tier = case
             when coalesce(membership_payment_status, '') = 'active' then membership_tier
             else coalesce(household_bundle_prior_tier, 'free')
           end,
           household_bundle_prior_tier = null,
           household_bundle_id = null
     where household_bundle_id = _owner
       and not (id = any(v_roster));
    get diagnostics v_unseated = row_count;

    -- 3b. Seat everyone on the roster who is not already in THIS bundle. `is distinct from`
    --     is what makes a replay a no-op: an already-seated member matches nothing here, so
    --     their prior tier is recorded exactly once, on the way in. All SET expressions read
    --     the OLD row, so prior_tier captures the pre-bundle tier even as the tier changes.
    --     Upgrade-only: a member already on a paid tier keeps it.
    update public.profiles
       set household_bundle_prior_tier = coalesce(membership_tier, 'free'),
           household_bundle_id = _owner,
           membership_tier = case
             when coalesce(membership_tier, 'free') = 'free' then _tier
             else membership_tier
           end
     where id = any(v_roster)
       and household_bundle_id is distinct from _owner;
    get diagnostics v_seated = row_count;

    -- 3c. Re-assert the granted tier for seats already in the bundle that have since fallen
    --     to free (a personal cancel event landed while they were seated). prior_tier is
    --     deliberately NOT touched, which is the whole reason a replay seats nothing extra.
    update public.profiles
       set membership_tier = _tier
     where household_bundle_id = _owner
       and coalesce(membership_tier, 'free') = 'free';
  else
    -- Terminal: the subscription ended. Empty the bundle, restoring each seat.
    update public.profiles
       set membership_tier = case
             when coalesce(membership_payment_status, '') = 'active' then membership_tier
             else coalesce(household_bundle_prior_tier, 'free')
           end,
           household_bundle_prior_tier = null,
           household_bundle_id = null
     where household_bundle_id = _owner;
    get diagnostics v_unseated = row_count;
    v_roster := '{}'::uuid[];
  end if;

  -- Advance the ordering stamp (and adopt the Stripe customer id, so the owner can reach
  -- the billing portal) in the same transaction as the seating it describes.
  update public.profiles
     set household_bundle_event_at = _event_at,
         stripe_customer_id = coalesce(_customer_id, stripe_customer_id)
   where id = _owner;

  return jsonb_build_object(
    'applied', true,
    'seated', v_seated,
    'unseated', v_unseated,
    'roster', to_jsonb(coalesce(v_roster, '{}'::uuid[]))
  );
end;
$$;

-- Lock to service_role only. Supabase default-grants EXECUTE to anon + authenticated on new
-- public functions, so revoking from public alone is not enough (ADR-964). The only caller is
-- the Stripe-signed webhook through the admin client (lib/billing/bundle-seats.ts).
revoke all on function public.apply_bundle_seating_atomic(uuid, timestamptz, uuid[], text, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.apply_bundle_seating_atomic(uuid, timestamptz, uuid[], text, integer, boolean, text) to service_role;

comment on function public.apply_bundle_seating_atomic(uuid, timestamptz, uuid[], text, integer, boolean, text) is
  'Seat or empty a Household / Circle bundle atomically (ADR-370). One transaction under a per-bundle advisory lock: drops the ordering-stale event, unseats who left, seats the roster (recording household_bundle_prior_tier once, on the way in), re-asserts the granted tier, and advances household_bundle_event_at. Every write is set-to-target keyed by profile id, so a Stripe redelivery seats nothing extra. Service-role only; called by the gated Stripe webhook.';

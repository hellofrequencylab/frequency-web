-- ============================================================================
-- HOUSEHOLD / CIRCLE BUNDLE INVITES: filling a seat AFTER the purchase (ADR-370 ·
-- builds on 20270225000000_household_bundle_seating.sql · shape follows
-- 20261230000000_circle_transfer_offers.sql).
--
-- THE GAP THIS CLOSES. A buyer who names their seats at checkout is fully served:
-- createBundleCheckout stamps the roster into the Stripe subscription metadata and the
-- webhook seats it. A buyer who bought first and chose later had no path at all, and
-- neither did a household whose fourth seat changes hands.
--
-- WHY AN INVITE AND NOT A DIRECT ASSIGNMENT. A bundle seat GRANTS A MEMBERSHIP TIER and
-- takes over `profiles.membership_tier`, recording what the person held before so leaving
-- restores it. That is a change to somebody else's account. The repo already settled this
-- question once, for the same reason, in circle_transfer_offers (ADR-845): a thing that
-- carries consequences for another person is OFFERED, never pushed. Same shape here — a
-- pending row, a status, a responder stamp — so the audit trail reads alike.
--
-- WHY THE INVITE TARGETS A PROFILE ID, NOT AN EMAIL. The two precedents chose differently
-- and both were right for what they seat:
--   · space_invites targets an EMAIL because a Space teammate may not have an account yet;
--     the invite IS the acquisition path, redeemed through a tokened link.
--   · circle_transfer_offers targets a PROFILE ID because only an existing member can accept
--     and the thing handed over attaches to a profile.
-- A bundle seat is `profiles.household_bundle_id` plus `profiles.membership_tier` — columns
-- that exist only once a profile does. There is nothing an email could be seated into, and
-- `public.profiles` carries no email column at all (addresses live in `auth.users`), so an
-- email-targeted invite would have to reach across schemas to resolve the very id it needs.
-- createBundleCheckout already made the same call in the other direction: it DEFAULT-DENIES a
-- seat id that is not a real profile rather than charge for a seat nobody can occupy. So this
-- table follows circle_transfer_offers: `to_profile_id`, a real FK, resolved from an @handle
-- before the row is written.
--
-- SEATS CANNOT BE OVERSOLD. The bundle was bought with a FIXED seat count, and until now that
-- number lived only in Stripe subscription metadata, where no in-app surface can read it. Two
-- columns below record the purchased terms on the OWNER's profile row at seating time, so an
-- invite can be counted against what was actually paid for without a Stripe round trip. A
-- PENDING invite occupies a seat exactly like a filled one: without that, an owner sends five
-- invites for three seats and the fourth acceptance lands on nothing.
--
-- 🔴 ACCEPTING AN INVITE MUST NOT ADVANCE `profiles.household_bundle_event_at`. That column is
-- the Stripe event-ordering guard: apply_bundle_seating_atomic drops any event created at or
-- before it. If an acceptance pushed that stamp to now(), the real
-- `customer.subscription.deleted` (created seconds earlier) would arrive looking stale, be
-- dropped, and a CANCELED bundle would stay seated with every member on a paid tier for free.
-- accept_bundle_invite_atomic below therefore writes the seat and NOTHING ELSE. It is a
-- separate function rather than a flag on the existing one precisely so the stamp write and
-- the seat write cannot be confused for one another at a call site. Pinned by
-- supabase/tests/household_bundle_invites.test.sql.
--
-- House style: additive + idempotent, expand-only, `add column if not exists` /
-- `create table if not exists` / `create or replace`, RLS enabled with NO policies and the
-- default grants closed (ADR-959/ADR-964), functions service_role only. The new table and
-- columns are reached from app code untyped until lib/database.types.ts regenerates (ADR-246).
-- SAFE to re-run.
--
-- INERT UNTIL SOLD. Every surface is gated on bundleSellable() = billingLive() AND
-- `bundle_household_enabled`, both default OFF, so on an unflipped platform no invite is ever
-- written and no seat ever moves.
--
-- ROLLBACK (manual; this migration is never auto-reverted):
--   drop function if exists public.accept_bundle_invite_atomic(uuid, uuid, text, integer);
--   drop function if exists public.create_bundle_invite_atomic(uuid, uuid, integer, integer);
--   drop table if exists public.household_bundle_invites;
--   alter table public.profiles drop column if exists household_bundle_seats;
--   alter table public.profiles drop column if exists household_bundle_tier;
--   (and restore apply_bundle_seating_atomic from 20270225000000)
-- ============================================================================

-- ── 1. The PURCHASED terms, recorded on the owner's row ───────────────────────────────
-- Stamped by apply_bundle_seating_atomic from the values the webhook read off the Stripe
-- subscription metadata, i.e. what the buyer actually bought. Kept here so a seat action
-- taken months later counts against the sold size, not against whatever the operator config
-- says today, and without a Stripe API call on a member's click. Cleared when the bundle
-- empties, so a canceled bundle grants nothing.
alter table public.profiles
  add column if not exists household_bundle_seats integer;
comment on column public.profiles.household_bundle_seats is
  'How many seats the Household / Circle bundle this profile OWNS was bought with (ADR-370), copied from the Stripe subscription metadata by apply_bundle_seating_atomic. The cap every post-purchase seat action counts against, so an operator config edit can never re-size a bundle already sold. NULL = this profile owns no live bundle. Inert while billing_live is OFF.';

alter table public.profiles
  add column if not exists household_bundle_tier text;
comment on column public.profiles.household_bundle_tier is
  'The membership_tier each seat in the bundle this profile OWNS was bought to grant (ADR-370), copied from the Stripe subscription metadata by apply_bundle_seating_atomic. Read by accept_bundle_invite_atomic so an invite grants exactly what was paid for. NULL = this profile owns no live bundle. Inert while billing_live is OFF.';

-- ── 2. household_bundle_invites ───────────────────────────────────────────────────────
create table if not exists public.household_bundle_invites (
  id                uuid primary key default gen_random_uuid(),
  -- The bundle, keyed by its owner exactly as the seat link is (profiles.household_bundle_id
  -- points at the owner). Only this profile may send or revoke.
  owner_profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- Who is invited. Only this profile may accept or decline.
  to_profile_id     uuid not null references public.profiles(id) on delete cascade,
  -- Free text with a check, matching space_invites: a new state is a check change, not a type
  -- change. pending -> accepted -> ended, or pending -> declined | revoked | expired.
  --   accepted = the seat is live and rides every later Stripe event (see §4)
  --   ended    = the seat was live and the bundle itself ended, so it must NOT be re-seated
  --              if the owner ever subscribes again
  status            text not null default 'pending'
                      check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired', 'ended')),
  -- A pending invite HOLDS A SEAT, so it cannot sit open forever or an owner's last seat is
  -- lost to somebody who never answered. 14 days, matching space_invites.
  expires_at        timestamptz not null default (now() + interval '14 days'),
  created_at        timestamptz not null default now(),
  responded_at      timestamptz
);

comment on table public.household_bundle_invites is
  'Household / Circle bundle seat invites (ADR-370). One row per offer of a seat to a member. A seat grants a membership tier and takes over the invitee''s membership_tier, so it is offered and accepted, never assigned — the same reasoning as circle_transfer_offers (ADR-845). Targets a profile id rather than an email because a seat is a profiles column and public.profiles carries no email. A PENDING row occupies a seat against profiles.household_bundle_seats so a bundle cannot be oversold. Service-role only: RLS ENABLED with NO policies; the only access path is lib/billing/bundle-invites.ts.';
comment on column public.household_bundle_invites.expires_at is
  'When a pending invite stops holding a seat. create_bundle_invite_atomic sweeps elapsed pending rows to ''expired'' before it counts, so an unanswered invite releases the seat it was holding.';

-- AT MOST ONE PENDING INVITE PER (bundle, member). Partial, so answered invites stay as
-- history while a second live invite to the same person cannot exist. This is the race guard:
-- a double-submit or two tabs collide in Postgres rather than holding two seats for one person.
create unique index if not exists household_bundle_invites_one_pending_idx
  on public.household_bundle_invites (owner_profile_id, to_profile_id)
  where status = 'pending';

-- The invitee's inbox read: "seats waiting on me".
create index if not exists household_bundle_invites_to_profile_idx
  on public.household_bundle_invites (to_profile_id, status);

-- The owner's seat manager: this bundle's outstanding invites.
create index if not exists household_bundle_invites_owner_idx
  on public.household_bundle_invites (owner_profile_id, status);

-- ── 3. Access: RLS on, zero policies, default grants closed ───────────────────────────
-- Deny-all is the posture (scripts/rls-deny-all.txt). The revoke is not decoration: Supabase
-- ships ALTER DEFAULT PRIVILEGES IN SCHEMA public, so anon and authenticated hold explicit
-- grants on a new table the moment it exists and `revoke ... from public` removes none of them
-- (ADR-959). service_role bypasses RLS and is not revoked from, so the real caller is untouched.
alter table public.household_bundle_invites enable row level security;
revoke all on table public.household_bundle_invites from anon, authenticated;

-- ── 4. apply_bundle_seating_atomic: AMENDED so an invited seat survives a renewal ──────
-- WHAT CHANGED AND WHY. The 20270225000000 version computed the roster from the STAMPED
-- metadata alone and unseated anyone in the bundle who was not on it. That is correct while
-- the checkout roster is the only roster. Once an invite can seat someone, it is a silent
-- eviction: the invitee accepts, the next renewal `customer.subscription.updated` arrives
-- carrying the same seat_ids it always did, and it unseats them.
--
-- So the metadata seat list is now what it always honestly was — the roster the bundle was
-- bought with — and the LIVE roster is the union of that list with whoever is seated in the
-- bundle right now. The purchased TERMS (seat count, granted tier) still come from the stamp
-- and are still immutable; only the membership of the roster became something the owner can
-- change after the sale, which is the entire point of this migration.
--
-- Everything else is unchanged and still load-bearing: strict `>` ordering guard, set-to-target
-- writes keyed by profile id, prior_tier recorded once on the way in, upgrade-only seating,
-- and a self-paying member never lowered. Re-running it seats nothing extra.
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
  v_seats    integer := greatest(coalesce(_seats, 1), 1);
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
  -- the conditional writes below cannot interleave with another delivery's. The invite
  -- functions take the SAME lock key, so an acceptance can never interleave with a webhook
  -- delivery either.
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
    -- The target roster: the owner first, then the seat ids stamped at checkout, then whoever
    -- ACCEPTED an invite into this bundle — first occurrence of each, ids that are not real
    -- profiles dropped, capped at the seat count the bundle was BOUGHT with. Deterministic
    -- (the invited tail is ordered by the answer it recorded, not by clock-at-read), so a
    -- replay computes the identical roster.
    --
    -- Reading the ACCEPTED INVITES rather than "whoever is seated right now" is deliberate:
    -- taking someone off the stamped seat list still unseats them on the next event, exactly
    -- as before, because a checkout seat leaves no invite row behind. Only a seat somebody
    -- agreed to survives, which is the one thing this migration adds.
    with stamped as (
      select c.id, c.ord::bigint as ord
        from unnest(array[_owner] || coalesce(_seat_ids, '{}'::uuid[])) with ordinality as c(id, ord)
    ), invited as (
      select i.to_profile_id as id,
             1000000 + row_number() over (order by i.responded_at, i.id) as ord
        from public.household_bundle_invites i
       where i.owner_profile_id = _owner
         and i.status = 'accepted'
    ), candidate as (
      select u.id, min(u.ord) as ord
        from (select id, ord from stamped union all select id, ord from invited) u
       where exists (select 1 from public.profiles p where p.id = u.id)
       group by u.id
    ), capped as (
      select id, ord from candidate order by ord limit v_seats
    )
    select coalesce(array_agg(id order by ord), '{}'::uuid[]) into v_roster from capped;

    -- 4a. Unseat whoever is in this bundle but off the new roster (the seat count shrank, or
    --     the roster no longer fits). Restore what they held; never lower someone who is
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

    -- 4b. Seat everyone on the roster who is not already in THIS bundle. `is distinct from`
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

    -- 4c. Re-assert the granted tier for seats already in the bundle that have since fallen
    --     to free (a personal cancel event landed while they were seated). prior_tier is
    --     deliberately NOT touched, which is the whole reason a replay seats nothing extra.
    update public.profiles
       set membership_tier = _tier
     where household_bundle_id = _owner
       and coalesce(membership_tier, 'free') = 'free';

    -- 4d. An accepted invite whose member is no longer on the roster (the seat count shrank
    --     under them) is CLOSED, not left accepted. Otherwise the very union above would
    --     re-seat them on the next event and the unseat would never stick.
    update public.household_bundle_invites
       set status = 'ended', responded_at = now()
     where owner_profile_id = _owner
       and status = 'accepted'
       and not (to_profile_id = any(v_roster));
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

    -- Nothing may be invited into a bundle that no longer exists, and no seat may outlive it.
    -- Close BOTH in the same transaction that empties the bundle: an outstanding offer cannot
    -- be accepted against a canceled subscription, and an accepted invite cannot re-seat
    -- anybody through the union above if the owner ever subscribes again.
    update public.household_bundle_invites
       set status = case when status = 'pending' then 'expired' else 'ended' end,
           responded_at = now()
     where owner_profile_id = _owner
       and status in ('pending', 'accepted');
  end if;

  -- Advance the ordering stamp, adopt the Stripe customer id (so the owner can reach the
  -- billing portal), and record the PURCHASED TERMS — all in the same transaction as the
  -- seating they describe. The terms are cleared on a terminal event, so a canceled bundle
  -- grants no seats to a later invite.
  update public.profiles
     set household_bundle_event_at = _event_at,
         stripe_customer_id = coalesce(_customer_id, stripe_customer_id),
         household_bundle_seats = case when _active then v_seats else null end,
         household_bundle_tier = case when _active then _tier else null end
   where id = _owner;

  return jsonb_build_object(
    'applied', true,
    'seated', v_seated,
    'unseated', v_unseated,
    'roster', to_jsonb(coalesce(v_roster, '{}'::uuid[]))
  );
end;
$$;

revoke all on function public.apply_bundle_seating_atomic(uuid, timestamptz, uuid[], text, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.apply_bundle_seating_atomic(uuid, timestamptz, uuid[], text, integer, boolean, text) to service_role;

comment on function public.apply_bundle_seating_atomic(uuid, timestamptz, uuid[], text, integer, boolean, text) is
  'Seat or empty a Household / Circle bundle atomically (ADR-370). One transaction under a per-bundle advisory lock: drops the ordering-stale event, unseats who left, seats the union of the checkout roster and whoever an accepted invite has since seated, re-asserts the granted tier, records the purchased seat count + tier, and advances household_bundle_event_at. Every write is set-to-target keyed by profile id, so a Stripe redelivery seats nothing extra. Service-role only; called by the gated Stripe webhook.';

-- ── 5. create_bundle_invite_atomic: offer a seat, without overselling ──────────────────
-- The oversell guard has to be a TRANSACTION, not an app-side read followed by an insert: two
-- invites sent at once for one remaining seat would both read "1 free" and both insert. Under
-- the same per-bundle advisory lock the webhook takes, the count and the insert are one act.
--
-- A PENDING invite counts against the cap exactly like a filled seat. Elapsed pending rows are
-- swept to 'expired' first, so an unanswered invite gives its seat back instead of holding it
-- forever, and the one-pending unique index stays honest about what is actually live.
create or replace function public.create_bundle_invite_atomic(
  _owner           uuid,
  _invitee         uuid,
  -- The seat count to fall back on for a bundle sold before the terms were recorded on the
  -- owner's row. The caller passes the live operator config, which is the same fallback
  -- reconcileBundleSubscription uses for a pre-stamp subscription.
  _seats_fallback  integer,
  _ttl_days        integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap      integer;
  v_seated   integer := 0;
  v_pending  integer := 0;
  v_owner_of uuid;
  v_in       uuid;
  v_id       uuid;
begin
  if _owner is null or _invitee is null then
    return jsonb_build_object('created', false, 'reason', 'invalid_args');
  end if;
  if _owner = _invitee then
    -- The owner already holds a seat and points at themselves. Inviting yourself is not a
    -- seat, it is a no-op that would consume one.
    return jsonb_build_object('created', false, 'reason', 'self');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('household_bundle:' || _owner::text, 0));

  select household_bundle_id, household_bundle_seats
    into v_owner_of, v_cap
    from public.profiles
   where id = _owner;
  -- A live bundle is one whose owner is seated in it. A bundle that was canceled (or never
  -- seated) must not hand out invitations to a subscription that is not paying.
  if v_owner_of is distinct from _owner then
    return jsonb_build_object('created', false, 'reason', 'bundle_inactive');
  end if;
  v_cap := greatest(coalesce(v_cap, _seats_fallback, 1), 1);

  -- Release the seats held by invites nobody answered, before counting.
  update public.household_bundle_invites
     set status = 'expired', responded_at = now()
   where owner_profile_id = _owner
     and status = 'pending'
     and expires_at <= now();

  select household_bundle_id into v_in from public.profiles where id = _invitee;
  if not found then
    return jsonb_build_object('created', false, 'reason', 'no_member');
  end if;
  if v_in = _owner then
    return jsonb_build_object('created', false, 'reason', 'already_seated');
  end if;
  -- A profile can sit in exactly one bundle (household_bundle_id is a single value), so an
  -- invite into a second one would silently move them and overwrite the prior tier the first
  -- bundle recorded. Refuse it here rather than discover it at accept time.
  if v_in is not null then
    return jsonb_build_object('created', false, 'reason', 'in_other_bundle');
  end if;

  select count(*) into v_seated from public.profiles where household_bundle_id = _owner;
  select count(*) into v_pending
    from public.household_bundle_invites
   where owner_profile_id = _owner and status = 'pending';

  if v_seated + v_pending >= v_cap then
    return jsonb_build_object('created', false, 'reason', 'no_seats', 'seats', v_cap);
  end if;

  begin
    insert into public.household_bundle_invites (owner_profile_id, to_profile_id, expires_at)
    values (_owner, _invitee, now() + make_interval(days => greatest(coalesce(_ttl_days, 14), 1)))
    returning id into v_id;
  exception when unique_violation then
    -- The one-pending partial index. Two tabs, or a re-send before the first was answered.
    return jsonb_build_object('created', false, 'reason', 'already_invited');
  end;

  return jsonb_build_object(
    'created', true,
    'invite_id', v_id,
    'seats', v_cap,
    'remaining', v_cap - v_seated - v_pending - 1
  );
end;
$$;

revoke all on function public.create_bundle_invite_atomic(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.create_bundle_invite_atomic(uuid, uuid, integer, integer) to service_role;

comment on function public.create_bundle_invite_atomic(uuid, uuid, integer, integer) is
  'Offer a Household / Circle bundle seat to a member (ADR-370). One transaction under the per-bundle advisory lock: expires elapsed pending invites, then counts filled seats PLUS live pending invites against the purchased seat count and refuses at the cap, so concurrent sends cannot oversell a bundle. Service-role only; called by the gated owner action in lib/billing/bundle-invites.ts.';

-- ── 6. accept_bundle_invite_atomic: seat the invitee, and touch NOTHING ELSE ───────────
--
-- 🔴 THIS FUNCTION MUST NEVER WRITE profiles.household_bundle_event_at. Read the header of
-- this file before changing a line of it. That column orders STRIPE events, and this is not
-- one: pushing it to now() would make the next real subscription event look stale, and a
-- canceled bundle would stay seated on a paid tier for free. The stamp is written in exactly
-- one place, apply_bundle_seating_atomic, and it belongs to the webhook.
--
-- Everything else mirrors the seating branch so the two cannot drift on what a seat IS:
-- prior_tier recorded once on the way in, upgrade-only tier grant, deterministic and
-- idempotent (accepting twice seats once).
create or replace function public.accept_bundle_invite_atomic(
  _invite          uuid,
  _member          uuid,
  -- Fallbacks for a bundle sold before the terms were recorded on the owner's row; the caller
  -- passes the live operator config, matching reconcileBundleSubscription's pre-stamp path.
  _tier_fallback   text,
  _seats_fallback  integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner    uuid;
  v_to       uuid;
  v_status   text;
  v_expires  timestamptz;
  v_owner_of uuid;
  v_cap      integer;
  v_tier     text;
  v_in       uuid;
  v_seated   integer := 0;
  v_claimed  integer := 0;
begin
  if _invite is null or _member is null then
    return jsonb_build_object('seated', false, 'reason', 'invalid_args');
  end if;

  select owner_profile_id, to_profile_id, status, expires_at
    into v_owner, v_to, v_status, v_expires
    from public.household_bundle_invites
   where id = _invite;
  if not found then
    return jsonb_build_object('seated', false, 'reason', 'not_found');
  end if;
  -- ONLY the invitee may accept. The gate is repeated here, under the lock, because this
  -- function is the thing that actually moves a membership tier.
  if v_to is distinct from _member then
    return jsonb_build_object('seated', false, 'reason', 'not_yours');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('household_bundle:' || v_owner::text, 0));

  -- Re-read under the lock: a revoke or a cancellation may have landed since.
  select status, expires_at into v_status, v_expires
    from public.household_bundle_invites where id = _invite;
  if v_status is distinct from 'pending' then
    return jsonb_build_object('seated', false, 'reason', 'already_answered');
  end if;
  if v_expires <= now() then
    update public.household_bundle_invites
       set status = 'expired', responded_at = now()
     where id = _invite and status = 'pending';
    return jsonb_build_object('seated', false, 'reason', 'expired');
  end if;

  select household_bundle_id, household_bundle_seats, household_bundle_tier
    into v_owner_of, v_cap, v_tier
    from public.profiles
   where id = v_owner;
  if v_owner_of is distinct from v_owner then
    return jsonb_build_object('seated', false, 'reason', 'bundle_inactive');
  end if;
  v_cap := greatest(coalesce(v_cap, _seats_fallback, 1), 1);
  v_tier := coalesce(v_tier, _tier_fallback);
  if v_tier is null or v_tier not in ('crew', 'supporter') then
    return jsonb_build_object('seated', false, 'reason', 'invalid_tier');
  end if;

  select household_bundle_id into v_in from public.profiles where id = _member;
  if not found then
    return jsonb_build_object('seated', false, 'reason', 'no_member');
  end if;
  if v_in is not null and v_in is distinct from v_owner then
    return jsonb_build_object('seated', false, 'reason', 'in_other_bundle');
  end if;

  -- The cap again, on the accept side. The send side counts pending invites so this rarely
  -- bites, but a seat can be filled by a checkout roster between send and accept, and the
  -- acceptance is the write that would actually oversell.
  select count(*) into v_seated from public.profiles where household_bundle_id = v_owner;
  if v_in is null and v_seated >= v_cap then
    return jsonb_build_object('seated', false, 'reason', 'no_seats', 'seats', v_cap);
  end if;

  -- Claim the invite FIRST, filtered on `status = 'pending'`. Zero rows back means another
  -- click or tab already answered it, and only the claim that moved the row goes on to seat.
  update public.household_bundle_invites
     set status = 'accepted', responded_at = now()
   where id = _invite and status = 'pending';
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then
    return jsonb_build_object('seated', false, 'reason', 'already_answered');
  end if;

  -- The seat. `is distinct from` makes a second acceptance a no-op on the profile: an
  -- already-seated member matches nothing, so prior_tier is recorded exactly once, on the way
  -- in, and a re-run cannot overwrite it with the tier the bundle itself granted.
  -- Upgrade-only: a member already on a paid tier keeps it.
  --
  -- 🔴 household_bundle_event_at is NOT in this statement, and must never be.
  update public.profiles
     set household_bundle_prior_tier = coalesce(membership_tier, 'free'),
         household_bundle_id = v_owner,
         membership_tier = case
           when coalesce(membership_tier, 'free') = 'free' then v_tier
           else membership_tier
         end
   where id = _member
     and household_bundle_id is distinct from v_owner;

  return jsonb_build_object('seated', true, 'owner', v_owner, 'tier', v_tier);
end;
$$;

revoke all on function public.accept_bundle_invite_atomic(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.accept_bundle_invite_atomic(uuid, uuid, text, integer) to service_role;

comment on function public.accept_bundle_invite_atomic(uuid, uuid, text, integer) is
  'Accept a Household / Circle bundle seat invite (ADR-370). One transaction under the per-bundle advisory lock: only the invitee may accept, the invite is claimed on status=pending so two clicks seat once, the seat count is re-checked so an acceptance cannot oversell, and the seat is written upgrade-only with the pre-bundle tier recorded once. DELIBERATELY does NOT write profiles.household_bundle_event_at: that column orders Stripe events, and advancing it here would make a real cancellation look stale and leave a canceled bundle seated. Service-role only.';

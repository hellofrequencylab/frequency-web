-- Space-plan event ordering gains a LIFECYCLE TIEBREAKER (LIVE-159, ADR-1214).
--
-- THE DEFECT. `claim_space_plan_event` (20261213000000) stamps spaces.last_plan_event_at iff the
-- event's `created` is STRICTLY newer. Stripe's `created` is unix SECONDS, and a checkout emits
-- `customer.subscription.created` and `customer.subscription.updated` for the same subscription
-- inside the SAME second routinely. The first to arrive claims the second; the second one fails the
-- strict `<` and is skipped as "stale". The dropped event is usually the `.updated` that carries the
-- SETTLED state (incomplete -> active), so a paid Space keeps the plan implied by its `incomplete`
-- snapshot and no further event ever arrives to fix it.
--
-- WHY NOT JUST LOOSEN THE COMPARISON. `<=` admits the same-second sibling in ARRIVAL order, so a
-- `.created` delivered AFTER its `.updated` would set-to-target the Space back to the pre-payment
-- snapshot. That trades a dropped event for a reverted one, which is worse: the revert is silent and
-- permanent.
--
-- WHAT ACTUALLY BREAKS THE TIE. Nothing in the payload carries a sequence number, and Stripe event
-- ids (`evt_...`) are NOT lexicographically ordered by time, so ordering by id would be ordering by
-- a random string. What IS deterministic is the SUBSCRIPTION LIFECYCLE the event type names: for one
-- subscription, `.created` can never follow `.updated`, and `.updated` can never follow `.deleted`.
-- The watermark therefore becomes the pair (created, rank):
--
--     rank 1 = customer.subscription.created
--     rank 2 = customer.subscription.updated
--     rank 3 = customer.subscription.deleted
--     rank 0 = unranked (an unknown/un-routed type, or a mark written by the pre-LIVE-159 caller)
--
-- Claim iff a strictly newer second, OR the SAME second with a rank that is not EARLIER in the
-- lifecycle. So `.created` then `.updated` both apply, in order (the row's case), while `.updated`
-- then `.created` still skips the `.created` -- the out-of-order case gets STRICTLY BETTER, not worse.
--
-- THE RESIDUE, STATED PLAINLY. Two events of the SAME type in the same second (two `.updated`s) are
-- genuinely unorderable: nothing in the payload distinguishes them. Those are admitted in arrival
-- order rather than dropped, because dropping is wrong whenever the two snapshots differ, while
-- arrival order is wrong only in the rarer case where Stripe also delivered them out of order. The
-- damaging reverts -- anything reverting a `.deleted`, or a `.created` landing on an `.updated` --
-- are ruled out by the rank regardless.
--
-- `last_plan_event_id` is recorded too. It is NOT an ordering key (see above); it is the identity of
-- the mark, so the router's rollback (releaseSpacePlanEvent, ADR-1209) can restore a watermark only
-- while the mark is still the one THIS event wrote, now that a same-second sibling can legitimately
-- claim on top of it.
--
-- SIGNATURE CHANGE. The 2-arg form is dropped and replaced by a 4-arg form whose two new arguments
-- DEFAULT (rank 0, id null), so a deploy that lands the migration before the code keeps working: an
-- old 2-arg caller resolves to the new function, writes an unranked mark, and behaves exactly as
-- before. Code-before-migration is the existing documented fail-open (the RPC errors, the router
-- proceeds unguarded). Additive + idempotent. Reversible: drop the two columns and re-create the
-- 20261213000000 body.

alter table public.spaces
  add column if not exists last_plan_event_rank smallint,
  add column if not exists last_plan_event_id text;

comment on column public.spaces.last_plan_event_rank is
  'Lifecycle rank of the newest space_plan Stripe event applied to this space: 1=subscription.created, 2=.updated, 3=.deleted, 0/NULL=unranked. The same-second tiebreaker for claim_space_plan_event (LIVE-159, ADR-1214). NOT a time; it only orders events sharing one last_plan_event_at second.';

comment on column public.spaces.last_plan_event_id is
  'Stripe event id (evt_...) that wrote last_plan_event_at. Identity of the mark, used by the webhook router to roll its own claim back after a failed reconcile (ADR-1209). NEVER an ordering key: Stripe event ids are not lexicographically ordered by time.';

drop function if exists public.claim_space_plan_event(uuid, timestamptz);

create or replace function public.claim_space_plan_event(
  _space_id uuid,
  _event_created timestamptz,
  _event_rank smallint default 0,
  _event_id text default null
)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.spaces
     set last_plan_event_at = _event_created,
         last_plan_event_rank = _event_rank,
         last_plan_event_id = _event_id
   where id = _space_id
     and (
       last_plan_event_at is null
       or last_plan_event_at < _event_created
       or (
         last_plan_event_at = _event_created
         and (
           -- Either side unranked -> no lifecycle evidence -> admit rather than drop.
           coalesce(last_plan_event_rank, 0) = 0
           or coalesce(_event_rank, 0) = 0
           -- Same second: later-or-equal lifecycle stage claims; an EARLIER stage is stale.
           or _event_rank >= last_plan_event_rank
         )
       )
     )
  returning true;
$$;

comment on function public.claim_space_plan_event(uuid, timestamptz, smallint, text) is
  'Atomically claim a space_plan Stripe event for reconciliation. Stamps spaces.last_plan_event_at / _rank / _id iff the event is strictly newer, or shares the stored second with a lifecycle rank that is not earlier (1=created, 2=updated, 3=deleted; 0=unranked, which never loses a tie). Returns true on claim; no row (null) for a stale event, which the webhook skips. Service-role only.';

revoke execute on function public.claim_space_plan_event(uuid, timestamptz, smallint, text) from public, anon, authenticated;
grant execute on function public.claim_space_plan_event(uuid, timestamptz, smallint, text) to service_role;

-- A full loyalty card can be claimed twice from two taps at the same moment (SCAN-841).
--
-- THE DEFECT. claimLoyaltyReward (LIVE-710) reads the member's visit count, then inserts a
-- partner_redemptions row with source 'loyalty'. There is no lock and no uniqueness rule
-- (20270346002600 adds only an index). Two concurrent requests from two tabs both see
-- 'earned' and both insert, and the counter staff see only a Claimed-at time. No cash
-- moves; the member still walks away with two rewards from one filled card.
--
-- THE FIX. SECURITY DEFINER RPC claim_loyalty_reward(_profile, _offer) takes
-- pg_advisory_xact_lock(hashtextextended(profile || ':' || offer)) so one member against
-- one card is serial, then re-reads the live card, counts plaque taps at that partner
-- since the latest loyalty claim of THIS card (the same rule as loyaltyProgress), and
-- inserts only when the count still meets visits_required. A second submit waits, sees
-- the first row, and raises not_earned. A later cycle still claims: the lock is not a
-- unique pair. The action keeps its pre-check as fast-fail UX; the RPC is the source of
-- truth. A missing RPC or any DB error fails closed.
--
-- AUTHORIZATION. service_role only, called through the admin client after the action's
-- own sign-in check. Grants are role-explicit and both revokes name the role (ADR-959).
--
-- Additive and idempotent: create or replace plus revokes. No table change.
--
-- Rollback: drop function if exists public.claim_loyalty_reward(uuid, uuid);

begin;

create or replace function public.claim_loyalty_reward(_profile uuid, _offer uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner uuid;
  v_required integer;
  v_last_claim timestamptz;
  v_visits integer;
  v_claimed_at timestamptz;
begin
  if _profile is null or _offer is null then
    raise exception 'not_running' using errcode = 'P0001';
  end if;

  -- Serialises one member against this card, so the visit count below cannot be raced by
  -- a second tap. Two cards, or two members, hash to two keys.
  perform pg_advisory_xact_lock(hashtextextended(_profile::text || ':' || _offer::text, 0));

  select o.partner_id, o.visits_required
    into v_partner, v_required
    from public.partner_offers o
    join public.partners p on p.id = o.partner_id
   where o.id = _offer
     and o.active
     and (o.valid_until is null or o.valid_until >= now())
     and p.status = 'active';

  if v_partner is null or v_required is null or v_required < 2 then
    raise exception 'not_running' using errcode = 'P0001';
  end if;

  select coalesce(max(redeemed_at), '-infinity'::timestamptz)
    into v_last_claim
    from public.partner_redemptions
   where profile_id = _profile
     and offer_id = _offer
     and source = 'loyalty';

  -- A visit is a plaque tap at this partner that is not itself a loyalty claim, matching
  -- loyaltyProgress: only taps after the latest claim of THIS card count.
  select count(*)::integer
    into v_visits
    from public.partner_redemptions
   where partner_id = v_partner
     and profile_id = _profile
     and source is distinct from 'loyalty'
     and redeemed_at > v_last_claim;

  if v_visits < v_required then
    raise exception 'not_earned' using errcode = 'P0001';
  end if;

  insert into public.partner_redemptions (partner_id, offer_id, profile_id, source)
  values (v_partner, _offer, _profile, 'loyalty')
  returning redeemed_at into v_claimed_at;

  return v_claimed_at;
end;
$$;

comment on function public.claim_loyalty_reward(uuid, uuid) is
  'Claim a filled loyalty card once: advisory-locked per (member, card), then re-check visits and insert source=loyalty. service_role only (SCAN-841).';

revoke execute on function public.claim_loyalty_reward(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_loyalty_reward(uuid, uuid) to service_role;

commit;

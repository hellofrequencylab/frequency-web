-- Season-capstone claim — race-proof count+claim (site-audit BUG-8).
--
-- The completion engine (lib/quest/complete.ts) counts journey_completions for the active season
-- and, at >= 3, claims the certificate via a UNIQUE(rule_key, profile_id) reward_grants row. The
-- COUNT read is non-atomic: two Journeys finishing concurrently can both observe a stale count < 3
-- (already mitigated by a fresh re-read + the idempotent claim lock, but a vanishingly small window
-- remains). This SECURITY DEFINER function serializes the count+claim per (member, season) under a
-- transaction-scoped advisory lock, so the count is always consistent and the claim fires exactly
-- once — the fully race-proof fix.
--
-- WRITE-ONLY (owner decision, 2026-06-29): this migration is prepared but NOT yet applied, and the
-- app does NOT call it yet (so production, which lacks the function, keeps using the existing
-- count+claim path unchanged). FOLLOW-UP once applied: in lib/quest/complete.ts replace the
-- journeysFinishedThisSeason() + grantCertificate() count/claim with a single
-- `claim_season_certificate(profileId, season)` RPC call, and keep the achievement / cosmetic /
-- Gem side effects guarded by its boolean return (true = this call won the claim).

create or replace function public.claim_season_certificate(
  p_profile_id uuid,
  p_season int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Serialize concurrent completions for this (member, season) so the count read can't race.
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_season::text, 0));

  select count(*) into v_count
  from public.journey_completions
  where profile_id = p_profile_id and season = p_season;

  if v_count < 3 then
    return false;
  end if;

  -- Claim-then-pay: the UNIQUE(rule_key, profile_id) row is the idempotency lock. The amount
  -- mirrors grantCertificate() in lib/quest/complete.ts (100 Gems, the capstone purse).
  insert into public.reward_grants (rule_key, profile_id, reward_kind, amount, detail)
  values ('certificate:' || p_season, p_profile_id, 'gems', 100, 'Certificate (season capstone)')
  on conflict (rule_key, profile_id) do nothing;

  -- FOUND is true only when THIS call inserted the claim (i.e. won the race); a later concurrent
  -- caller that loses the conflict returns false and skips the one-time side effects.
  return found;
end;
$$;

-- Lock execution down to the service role (the app's admin client); the function is never called
-- from a browser session.
revoke all on function public.claim_season_certificate(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_season_certificate(uuid, int) to service_role;

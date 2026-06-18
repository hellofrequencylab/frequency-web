-- Re-award JOIN + INVITE Zaps after the Rewards Economy v3 wipe (scope A, owner-approved).
--
-- The v3 rebuild wiped reward_grants / zap_transactions / gem_transactions. The join + invite
-- relationships survived on `profiles` (referred_by_profile_id) so we reconstruct the Zaps members
-- earned for joining and for inviting others, at the live v3 amounts (zap_config):
--   (a) community_join      10z  -> every real member            key: join.welcome
--   (b) referred_join_bonus 15z  -> members who joined via a friend  key: join.referred
--   (c) invite_accepted     40z  -> the inviter, once per invitee     key: referral.activated:{invitee}
--
-- Idempotent: reward_grants UNIQUE(rule_key, profile_id) + ON CONFLICT DO NOTHING means re-running
-- never double-pays. Inserting zap_transactions fires after_zap_transaction (season_zaps + amplitude
-- recompute). Real population only: is_active AND NOT is_system AND NOT is_demo. Mirrors the prior
-- pre-wipe backfill 20260616130000_join_zaps.sql.

-- Run as the service role for this transaction so the economy triggers (which update protected
-- profile columns) are allowed past prevent_economy_self_edit() (auth.role() = 'service_role').
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

-- (a) Joined the community.
with members as (
  select id from public.profiles
  where is_active and not is_system and not coalesce(is_demo, false)
), claimed as (
  insert into public.reward_grants (rule_key, profile_id, reward_kind, amount, detail)
  select 'join.welcome', id, 'zaps',
         coalesce((select zaps_amount from public.zap_config where action_type = 'community_join'), 10),
         'Joined the community'
  from members
  on conflict (rule_key, profile_id) do nothing
  returning profile_id, amount
)
insert into public.zap_transactions (profile_id, action_type, amount, metadata)
select profile_id, 'community_join', amount, jsonb_build_object('backfill', 'v3-rebuild')
from claimed;

-- (b) Joined through a friend.
with referred as (
  select id from public.profiles
  where is_active and not is_system and not coalesce(is_demo, false)
    and referred_by_profile_id is not null
), claimed as (
  insert into public.reward_grants (rule_key, profile_id, reward_kind, amount, detail)
  select 'join.referred', id, 'zaps',
         coalesce((select zaps_amount from public.zap_config where action_type = 'referred_join_bonus'), 15),
         'Joined through a friend'
  from referred
  on conflict (rule_key, profile_id) do nothing
  returning profile_id, amount
)
insert into public.zap_transactions (profile_id, action_type, amount, metadata)
select profile_id, 'referred_join_bonus', amount, jsonb_build_object('backfill', 'v3-rebuild')
from claimed;

-- (c) Invite accepted (paid to the inviter, once per real invitee; inviter must also be real).
with pairs as (
  select inv.id as invitee, ref.id as inviter
  from public.profiles inv
  join public.profiles ref on ref.id = inv.referred_by_profile_id
  where inv.is_active and not inv.is_system and not coalesce(inv.is_demo, false)
    and ref.is_active and not ref.is_system and not coalesce(ref.is_demo, false)
), claimed as (
  insert into public.reward_grants (rule_key, profile_id, reward_kind, amount, detail)
  select 'referral.activated:' || invitee, inviter, 'zaps',
         coalesce((select zaps_amount from public.zap_config where action_type = 'invite_accepted'), 40),
         'Someone you invited got started'
  from pairs
  on conflict (rule_key, profile_id) do nothing
  returning profile_id, amount
)
insert into public.zap_transactions (profile_id, action_type, amount, metadata)
select profile_id, 'invite_accepted', amount, jsonb_build_object('backfill', 'v3-rebuild')
from claimed;

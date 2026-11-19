-- SEC-026: a signed-in member cannot promote themselves to staff, grant themselves a paid tier,
-- point payouts at a Stripe account, or lift their own suspension by writing their profiles row.
--
-- THE GAP. "profiles: self update" lets a member UPDATE their own row (auth_user_id = auth.uid()),
-- and the authenticated role holds UPDATE on every column. Only four columns families were frozen
-- by triggers: community_role (prevent_role_self_escalation), the economy and cosmetic columns
-- (prevent_economy_self_edit) and meta.founder (prevent_founder_meta_self_edit). Everything else
-- was writable from the browser console with the public anon key and the member's own session:
--
--   update profiles set web_role = 'admin' where auth_user_id = auth.uid()
--
-- landed (verified 2026-11-19 in a rolled-back transaction as an ordinary member, row_count 1,
-- web_role read back 'admin'). web_role is the STAFF axis (ADR-208) behind lib/admin/guard.ts,
-- private.get_my_web_role() and every staff-only RLS policy and definer door. The same write could
-- set membership_tier (Crew without paying, which unlocks Crew money rules), is_founding_member,
-- is_supporter, verified_at, stripe_account_id and stripe_charges_enabled (payouts and the "can
-- sell" gate), suspended_at / suspended_until (lift a moderator's suspension, which also reopens
-- every enforce_member_not_suspended write), household_bundle_* and referred_by_profile_id.
-- Production holds no forged value today: one janitor (the owner) and 78 'none'.
--
-- THE FIX. A BEFORE UPDATE trigger that applies to the CALLER ROLES ONLY, the same shape as
-- guard_event_rsvp_member_write (SCAN-696). It returns NEW untouched when current_user is
-- service_role, postgres or supabase_admin: the admin client, the migration runner and every
-- SECURITY DEFINER door (merge_profile_meta runs as its owner). Every app writer of these columns
-- already uses the admin client (lib/billing/connect.ts, lib/founding/status.ts,
-- app/(main)/admin/actions.ts, app/(main)/feed/report-actions.ts, lib/qr/referral.ts,
-- lib/verification/attendance.ts, lib/billing/checkout.ts, app/join/(induction)/actions.ts).
-- The member's own settings columns (name, handle, bio, avatar, home, discovery, ghost mode, meta)
-- stay writable. SECURITY INVOKER on purpose: a definer body would read its owner as current_user
-- and exempt every write.
--
-- ROLLBACK:
--   drop trigger if exists trg_a_profiles_privileged_column_guard on public.profiles;
--   drop function if exists public.guard_profile_privileged_columns();
--
-- House style: idempotent, pinned search_path, no EXECUTE for client roles. No em or en dashes.
-- pgTAP: supabase/tests/profiles_privileged_column_guard.test.sql.

begin;

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.web_role                       is distinct from old.web_role
  or new.community_level                is distinct from old.community_level
  or new.membership_tier                is distinct from old.membership_tier
  or new.membership_payment_status      is distinct from old.membership_payment_status
  or new.locked_price_id                is distinct from old.locked_price_id
  or new.stripe_account_id              is distinct from old.stripe_account_id
  or new.stripe_customer_id             is distinct from old.stripe_customer_id
  or new.stripe_charges_enabled         is distinct from old.stripe_charges_enabled
  or new.stripe_payouts_enabled         is distinct from old.stripe_payouts_enabled
  or new.stripe_details_submitted       is distinct from old.stripe_details_submitted
  or new.last_stripe_event_at           is distinct from old.last_stripe_event_at
  or new.suspended_at                   is distinct from old.suspended_at
  or new.suspended_until                is distinct from old.suspended_until
  or new.suspended_reason               is distinct from old.suspended_reason
  or new.suspended_by                   is distinct from old.suspended_by
  or new.verified_at                    is distinct from old.verified_at
  or new.verification_method            is distinct from old.verification_method
  or new.is_founding_member             is distinct from old.is_founding_member
  or new.is_supporter                   is distinct from old.is_supporter
  or new.is_crew_lead                   is distinct from old.is_crew_lead
  or new.is_system                      is distinct from old.is_system
  or new.is_demo                        is distinct from old.is_demo
  or new.gamification_access_override   is distinct from old.gamification_access_override
  or new.household_bundle_id            is distinct from old.household_bundle_id
  or new.household_bundle_tier          is distinct from old.household_bundle_tier
  or new.household_bundle_prior_tier    is distinct from old.household_bundle_prior_tier
  or new.household_bundle_seats         is distinct from old.household_bundle_seats
  or new.household_bundle_event_at      is distinct from old.household_bundle_event_at
  or new.achievement_count              is distinct from old.achievement_count
  or new.current_streak                 is distinct from old.current_streak
  or new.longest_streak                 is distinct from old.longest_streak
  or new.referred_by_profile_id         is distinct from old.referred_by_profile_id
  or new.auth_user_id                   is distinct from old.auth_user_id then
    raise exception 'profiles: staff role, plan, payout, suspension, verification and reward columns are written by the server, never by the member'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_profile_privileged_columns() is
  'BEFORE UPDATE on profiles (SEC-026). Under a caller role (authenticated, anon) the staff role, plan, Stripe, suspension, verification, founding, bundle, streak, referral and auth link columns may not change. Exempt: service_role, postgres, supabase_admin (the admin client and every SECURITY DEFINER door). SECURITY INVOKER by design.';

revoke execute on function public.guard_profile_privileged_columns() from public, anon, authenticated;

drop trigger if exists trg_a_profiles_privileged_column_guard on public.profiles;
create trigger trg_a_profiles_privileged_column_guard
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

commit;

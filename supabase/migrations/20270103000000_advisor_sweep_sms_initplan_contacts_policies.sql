-- Advisor sweep (maintenance 2026-07-27): clear the two WARNs the linter raised against
-- yesterday's SMS + contacts migrations. Behaviour-preserving on both tables.
--
--   1. auth_rls_initplan on public.sms_consent — `sms_consent_select_own` calls auth.uid()
--      BARE, so Postgres re-evaluates it per row instead of once per statement. Every other
--      policy in this schema wraps it as (select auth.uid()) (20260611144007 did the sweep);
--      this one arrived after and missed the convention.
--
--   2. multiple_permissive_policies on public.network_contacts — SELECT for `authenticated`
--      is answered by TWO permissive policies (`network_contacts_select` +
--      `network_contacts_select_shared`), so every row pays both predicates. Consolidating is
--      safe because the shared branch is anon-inert: every arm of it requires (select auth.uid())
--      to resolve to a space owner or active member, which is empty for anon — OR-ing it into
--      the one public SELECT policy grants anon nothing it could not already satisfy.

-- ── 1. sms_consent: once-per-statement auth call ─────────────────────────────────────────
drop policy if exists sms_consent_select_own on public.sms_consent;
create policy sms_consent_select_own on public.sms_consent
  for select using (
    profile_id in (
      select profiles.id from public.profiles
      where profiles.auth_user_id = (select auth.uid())
    )
  );

-- ── 2. network_contacts: ONE permissive SELECT policy per role ───────────────────────────
drop policy if exists network_contacts_select_shared on public.network_contacts;
drop policy if exists network_contacts_select on public.network_contacts;
create policy network_contacts_select on public.network_contacts
  for select using (
    -- own contacts
    owner_id in (
      select profiles.id from public.profiles
      where profiles.auth_user_id = (select auth.uid())
    )
    -- network-visible contacts
    or visibility = 'network'
    -- space-shared contacts (formerly network_contacts_select_shared): visible to the
    -- shared Space's owner or an active member. Anon-inert by construction — see header.
    or (
      visibility = 'shared'
      and shared_space_id is not null
      and (
        shared_space_id in (
          select s.id from public.spaces s
          where s.owner_profile_id in (
            select p.id from public.profiles p
            where p.auth_user_id = (select auth.uid())
          )
        )
        or shared_space_id in (
          select m.space_id from public.space_members m
          where m.status = 'active'
            and m.profile_id in (
              select p.id from public.profiles p
              where p.auth_user_id = (select auth.uid())
            )
        )
      )
    )
  );

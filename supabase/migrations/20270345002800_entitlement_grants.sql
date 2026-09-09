-- =============================================================================
-- CREW GRANTED BY A PAID COMMUNITY MEMBERSHIP (LIVE-223)
--
-- THE MODEL. People join free, businesses host free, you pay when you start
-- charging. Nobody buys Crew as a subscription any more: you get it by paying
-- dues to a community. Owner ruling: ANY active PAID membership, at ANY price,
-- grants Crew.
--
-- WHY A TABLE AND NOT A COLUMN WRITE. profiles.membership_tier is a bare scalar
-- with NO PROVENANCE: nothing in it records WHY a profile is crew. Writing the
-- grant straight into that column is a one-way door, because when the membership
-- lapses there is no way to tell the grant apart from a tier somebody pays Stripe
-- for directly, so the revoke would downgrade paying customers. The pattern
-- copied here is the one already proven on circle access (ADR-859):
-- memberships.granted_by_tier_id stamps every row the tier engine created, and
-- revoke deletes only rows carrying the revoking tier's id.
--
-- So the grant gets its own row, stamped with the tier that made it, and the
-- effective tier is the union of two independently revocable facts:
--
--     effective tier = stripe_active OR EXISTS(an active grant)
--
-- resolved in lib/core/entitlement.ts (resolveEffectiveTier) and read by
-- getViewerHats + load-capabilities' currentViewer. profiles.membership_tier is
-- NOT touched by this feature, in this migration or at runtime.
--
-- A ROW IS THE GRANT. Revoke DELETES. There is deliberately no revoked_at: two
-- representations of "not granted" is one more than can be kept in step, and the
-- history that matters (who paid what, when) already lives on space_memberships.
--
-- THE SIX LIFECYCLE SITES. Five are wired in code, through the one seam every
-- membership lifecycle site already calls (syncTierCircleAccess ->
-- syncCrewEntitlement): created, renewed, cancelled, expired, refunded. The
-- SIXTH -- TIER DELETED -- is wired HERE instead, as
-- granted_by_tier_id ... ON DELETE CASCADE. Deleting a tier removes exactly the
-- grants that tier made and nothing else, with no app code to forget to call.
-- (Contrast memberships.granted_by_tier_id, which is ON DELETE SET NULL because a
-- circle membership is a place in a room the member should keep; a Crew grant is
-- an entitlement the deleted tier was the entire reason for.)
--
-- THE SELF-GRANT GUARD. Only paid Spaces may create membership tiers, so opening
-- a $1 tier already costs a Business subscription. That narrows the loophole but
-- does not close it: a Space's own owner and admins could still mint themselves
-- Crew from a tier they control, which is a grant with no counterparty. The
-- trigger below refuses those rows. It is enforced twice (here and in
-- lib/billing/crew-grants.ts) because an app-only rule is one direct write away
-- from being no rule at all.
--
-- WHAT THIS DOES NOT DO: it does not touch the take rate. Crew takes the member
-- network take rate from 10% to 8%, and a granted Crew must NOT inherit that, or
-- a $1 membership tier becomes a machine for buying the rate down. Money reads
-- the STRIPE rung (billedTier), never the resolved tier -- LIVE-224, locked by
-- lib/billing/granted-crew-take-rate.test.ts.
--
-- NOT IN THIS MIGRATION, and deliberately so: membership_tier does NOT join
-- prevent_economy_self_edit. An earlier draft added it; db-tests showed it blocks
-- the atomic membership and bundle writers, which run with the caller's role. See
-- section 4 for the full reasoning. The self-grant path it targeted is closed by
-- the entitlement_grants trigger instead.
--
-- House style: additive + idempotent, SAFE to re-run. No em or en dashes.
--
-- ROLLBACK:
--   drop trigger if exists entitlement_grants_no_self_grant on public.entitlement_grants;
--   drop function if exists public.refuse_self_granted_entitlement();
--   drop table if exists public.entitlement_grants;
-- =============================================================================

-- ── 1) The grants table ──────────────────────────────────────────────────────
create table if not exists public.entitlement_grants (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  -- The rung granted. Wider than today's single value so a future rung needs no
  -- migration; the CHECK keeps a typo from silently granting nothing.
  tier               text not null default 'crew' check (tier in ('crew')),
  -- WHY the row exists. One source today; the column keeps the door open for a
  -- comp or a partner grant without turning this into an untyped free-for-all.
  source             text not null default 'space_membership'
                       check (source in ('space_membership')),
  -- PROVENANCE. The tier that made this grant. ON DELETE CASCADE is the sixth
  -- lifecycle site (see the header).
  granted_by_tier_id uuid not null
                       references public.space_membership_tiers(id) on delete cascade,
  space_id           uuid not null references public.spaces(id) on delete cascade,
  granted_at         timestamptz not null default now()
);

comment on table public.entitlement_grants is
  'Crew granted by an active paid community membership (LIVE-223). A row IS an active grant; revoke deletes it. profiles.membership_tier stays the STRIPE rung and is never written by this feature: the effective tier is the union stripe_active OR EXISTS(grant), resolved in lib/core/entitlement.ts. The take rate reads the Stripe rung only (LIVE-224).';

comment on column public.entitlement_grants.granted_by_tier_id is
  'Provenance: the space_membership_tiers row whose paid membership granted this. Revoke deletes ONLY rows carrying the revoking tier id, so a Crew somebody pays Stripe for, or a grant from a different community, can never be touched. ON DELETE CASCADE wires the tier-deleted lifecycle site in the schema.';

-- One grant per (member, granting tier). Makes the write idempotent: a repeated
-- lifecycle event is a swallowed 23505, not a duplicate entitlement.
create unique index if not exists entitlement_grants_profile_tier_uniq
  on public.entitlement_grants (profile_id, granted_by_tier_id);

-- THE hot read: "does this profile hold an active Crew grant?", asked on every
-- render that resolves the viewer's tier.
create index if not exists entitlement_grants_profile_idx
  on public.entitlement_grants (profile_id, tier);

-- The revoke-by-provenance path and the operator's "who does this tier grant?".
create index if not exists entitlement_grants_tier_idx
  on public.entitlement_grants (granted_by_tier_id);

-- ── 2) The self-grant guard (belt to the app's braces) ───────────────────────
create or replace function public.refuse_self_granted_entitlement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- A Space's own owner or admin is not grantable by their own Space's tier: a
  -- membership sold to yourself has no counterparty, and without this any
  -- operator could mint themselves Crew from a $1 tier they control.
  if exists (
    select 1 from public.spaces s
     where s.id = new.space_id
       and s.owner_profile_id = new.profile_id
  ) or exists (
    -- The ladder is viewer < editor < moderator < admin and there is no 'owner'
    -- role: the owner is the spaces.owner_profile_id FK checked above.
    select 1 from public.space_members m
     where m.space_id = new.space_id
       and m.profile_id = new.profile_id
       and m.status = 'active'
       and m.role = 'admin'
  ) then
    raise exception
      'a space owner or admin cannot be granted crew by their own membership tier'
      using errcode = 'P0001';
  end if;

  -- The grant is for PAID memberships only. Any price qualifies (owner ruling);
  -- zero does not.
  if not exists (
    select 1 from public.space_membership_tiers t
     where t.id = new.granted_by_tier_id
       and t.space_id = new.space_id
       and t.price_cents > 0
  ) then
    raise exception
      'crew is granted only by a paid membership tier belonging to this space'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke execute on function public.refuse_self_granted_entitlement() from public, anon, authenticated;

drop trigger if exists entitlement_grants_no_self_grant on public.entitlement_grants;
create trigger entitlement_grants_no_self_grant
  before insert or update on public.entitlement_grants
  for each row
  execute function public.refuse_self_granted_entitlement();

-- ── 3) RLS: a member may read their own grants; nobody writes but service_role ─
alter table public.entitlement_grants enable row level security;

drop policy if exists "entitlement_grants read own" on public.entitlement_grants;
create policy "entitlement_grants read own"
  on public.entitlement_grants
  for select
  using (
    profile_id in (
      select p.id from public.profiles p where p.auth_user_id = auth.uid()
    )
  );

-- No insert/update/delete policy exists on purpose: the lifecycle engine writes
-- through the service-role client, which bypasses RLS. A caller-role write is a
-- self-grant by definition.
revoke insert, update, delete on public.entitlement_grants from anon, authenticated;

-- ── 4) membership_tier deliberately does NOT join the economy lock ───────────
-- 🔴 An earlier draft of this migration added `membership_tier` to the guard on the
-- reasoning that "every legitimate writer already uses the service role, so it is a
-- no-op for the app". THAT WAS FALSE, and db-tests proved it on the first real run:
-- the guard fires on `auth.role() is distinct from 'service_role'`, and the atomic
-- SECURITY DEFINER writers run with the CALLER's role, not the definer's. It blocked
--   * apply_membership_event_atomic   -- the Stripe membership webhook writer
--   * apply_bundle_seating_atomic     -- household bundle seating
-- taking out 43 subtests across three suites. Shipping it would have put a trigger in
-- front of the path that applies paid memberships, which is the highest-consequence
-- write in the product.
--
-- It is not re-added here, and it should not be re-added without exempting those
-- writers first. Nothing is lost: the self-grant hole it was meant to cover is already
-- closed twice over, by refuse_self_granted_entitlement() below (owner/admin and
-- zero-price refusal) and by the price floor in lib/billing/membership-tier-price.ts.
-- It was defence in depth, and defence in depth is not worth a money-path regression.
--
-- This block is now a no-op re-declaration kept only for the ACL note: CREATE OR
-- REPLACE preserves the ACL the lockdown migration (20260926000000) set, and the
-- revoke is repeated for idempotence.
create or replace function public.prevent_economy_self_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.role() is distinct from 'service_role' and (
        new.current_season_zaps IS DISTINCT FROM old.current_season_zaps
     or new.lifetime_zaps        IS DISTINCT FROM old.lifetime_zaps
     or new.lifetime_gems        IS DISTINCT FROM old.lifetime_gems
     or new.current_season_rank  IS DISTINCT FROM old.current_season_rank
     or new.lifetime_rank        IS DISTINCT FROM old.lifetime_rank
     or new.is_active            IS DISTINCT FROM old.is_active
     or new.profile_border       IS DISTINCT FROM old.profile_border
     or new.profile_flair        IS DISTINCT FROM old.profile_flair
     or new.custom_title         IS DISTINCT FROM old.custom_title
     or new.profile_theme        IS DISTINCT FROM old.profile_theme
  ) then
    raise exception
      'economy, rank, status, and cosmetic columns cannot be modified by users - use server actions'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke execute on function public.prevent_economy_self_edit() from public, anon, authenticated;

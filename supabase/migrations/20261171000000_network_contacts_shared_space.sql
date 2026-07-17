-- The 'shared' visibility tier for personal network contacts (ADR-154 tier 'shared', ADR-778).
--
-- ADR-098 built network_contacts as an OWNER-SCOPED personal CRM: private by default, with
-- visibility gating promotion (private -> shared -> network). ADR-132/154 shipped the private<->network
-- toggle for members; 'shared' was left as a deliberate, deferred decision. This migration lands it.
--
-- THE DECISION (ADR-778). 'shared' means: the contact's CARD is readable by the STAFF/TEAM of a Space
-- the OWNING member operates. It is scoped to ONE Space (shared_space_id), chosen by the owner. Two
-- distinct bars, on purpose:
--   * WHO MAY SHARE (choose 'shared')  — the owner must OPERATE the target Space: they are its owner
--     (spaces.owner_profile_id) OR an ACTIVE 'admin' space_member. A member who operates NO Space is
--     never offered the tier. Enforced server-side (lib/connections/visibility.ts + lib/spaces/operated.ts).
--   * WHO MAY READ (the audience)      — the Space's TEAM: its owner OR any ACTIVE space_member (any
--     role). Reading is passive; the whole team the owner assembled can see the shared card.
--
-- PRIVACY INVARIANT (non-negotiable, mirrors ADR-742 promotion). Sharing exposes the CARD only:
-- name, role, company, city, links, email, phone. The owner's private NOTES and TAGS are NEVER shared,
-- and the owner keeps full CRUD. This RLS grants the team a READ of the parent row only; the notes/tags
-- policies are UNTOUCHED (they stay owner-only, so a team member's read can never reach them). The
-- cross-steward network_local tier (ADR-132) and canViewLead are likewise untouched by this.
--
-- Additive + idempotent, applied via the Supabase SQL Editor (repo house style, docs/WORKFLOW.md).
-- lib/database.types.ts is regenerated separately; the store already reaches new columns through the
-- untyped admin handle (the last_contacted_at pattern). SAFE to re-run.

-- ── The scope column ─────────────────────────────────────────────────────────
-- The ONE Space a 'shared' contact is shared with. Nullable; set ONLY when visibility='shared'.
-- on delete SET NULL (never cascade): deleting a Space must never delete a member's personal contact.
-- When the Space is gone the row keeps visibility='shared' with a null scope, which the read policy
-- treats as invisible to any team (it falls back to owner-only) — fail-closed.
alter table public.network_contacts
  add column if not exists shared_space_id uuid references public.spaces(id) on delete set null;

comment on column public.network_contacts.shared_space_id is
  'The Space whose TEAM may read this card when visibility=''shared'' (ADR-778). References spaces(id), on delete set null (never cascade — a Space delete must not delete a personal contact). Set only when visibility=''shared''; NULL otherwise. Only the card fields surface to the team; notes/tags stay owner-private.';

-- Data-integrity guard: a shared_space_id may exist ONLY on a 'shared' row. A private/network row
-- must carry no scope (so a downgrade always clears it). Idempotent add.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'network_contacts_shared_space_scope_ck'
  ) then
    alter table public.network_contacts
      add constraint network_contacts_shared_space_scope_ck
      check (shared_space_id is null or visibility = 'shared');
  end if;
end $$;

-- The partial index behind the team read policy + the listSharedWithSpace(spaceId) reader: only the
-- shared rows are ever scanned by shared_space_id.
create index if not exists network_contacts_shared_space_idx
  on public.network_contacts (shared_space_id) where visibility = 'shared';

-- ── RLS: the Space-team READ (additive; owner + network policies stay intact) ──
-- A permissive SELECT policy OR-ed alongside network_contacts_select (owner + visibility='network').
-- It grants a READ of a shared row to the TEAM of shared_space_id: the Space owner, or any ACTIVE
-- space_member (any role). The caller's profile is resolved the SAME way every network_contacts
-- policy resolves it — profiles.auth_user_id = auth.uid() (profiles.id is a distinct surrogate key,
-- NOT the auth uid). The auth subquery is wrapped in (select auth.uid()) so it runs once per
-- statement, not per row (Supabase RLS perf rule).
--
-- READ ONLY. There is deliberately NO shared insert/update/delete policy: writes stay owner-only
-- (network_contacts_insert/update/delete, unchanged), so a team member can see the card but can never
-- edit, re-scope, or delete someone else's personal contact.
drop policy if exists network_contacts_select_shared on public.network_contacts;
create policy network_contacts_select_shared on public.network_contacts
  for select to authenticated
  using (
    visibility = 'shared'
    and shared_space_id is not null
    and (
      -- (a) the caller OWNS the shared Space
      shared_space_id in (
        select s.id from public.spaces s
        where s.owner_profile_id in (
          select p.id from public.profiles p where p.auth_user_id = (select auth.uid())
        )
      )
      -- (b) the caller is an ACTIVE member (any role) of the shared Space — the team
      or shared_space_id in (
        select m.space_id from public.space_members m
        where m.status = 'active'
          and m.profile_id in (
            select p.id from public.profiles p where p.auth_user_id = (select auth.uid())
          )
      )
    )
  );

comment on column public.network_contacts.visibility is
  'private (owner only) | shared (the team of shared_space_id — ADR-778) | network (readable by same-city stewards, ADR-132). Promotion is a deliberate act so personal captures do not bleed into public data.';

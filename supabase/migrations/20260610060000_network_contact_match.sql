-- Contact ↔ Community merge (docs/NETWORK-CRM.md). When a person you logged in your
-- personal contact book (network_contacts) later joins the community as a member
-- (profiles) — or you log a contact for someone already a member — the two records
-- describe the same human. This adds the plumbing to DETECT that overlap and let the
-- owner MERGE: a deliberate, owner-only link (network_contacts.linked_profile_id,
-- which already exists) plus a dismissal flag so a declined suggestion stays quiet.
--
-- Matching is by a hard signal only — same email (case-insensitive) or same phone
-- (digits only, ≥7 digits) — never a fuzzy name, so we never nag on a coincidence.
-- The match read joins auth.users (for the member's email), so it runs as a
-- SECURITY DEFINER function scoped to one owner. Additive + idempotent.

-- ── Dismissal flag ───────────────────────────────────────────────────────────
alter table public.network_contacts
  add column if not exists match_dismissed boolean not null default false;

comment on column public.network_contacts.match_dismissed is
  'The owner dismissed the "this contact is a member" merge suggestion. Keeps a declined match from re-surfacing. linked_profile_id (already present) is the merge link itself.';

-- A partial index for the candidate scan: unlinked, not-dismissed contacts that
-- carry a hard identifier worth matching.
create index if not exists network_contacts_match_candidates_idx
  on public.network_contacts (owner_id)
  where linked_profile_id is null and match_dismissed = false;

-- ── Match detector ───────────────────────────────────────────────────────────
-- For one owner, return their unlinked/undismissed contacts that hard-match a member
-- profile (by email or phone). SECURITY DEFINER so it can read auth.users.email; the
-- owner is passed in and every row is filtered to owner_id = p_owner, so it can only
-- ever reveal the caller's own contacts. A contact never matches the owner's own
-- profile (p.id <> nc.owner_id).
create or replace function public.find_contact_matches(p_owner uuid)
returns table (contact_id uuid, profile_id uuid, match_on text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (nc.id)
    nc.id as contact_id,
    p.id  as profile_id,
    case
      when nc.email is not null and u.email is not null
           and lower(nc.email) = lower(u.email) then 'email'
      else 'phone'
    end as match_on
  from public.network_contacts nc
  join public.profiles p
    on p.id <> nc.owner_id
  left join auth.users u
    on u.id = p.auth_user_id
  where nc.owner_id = p_owner
    and nc.linked_profile_id is null
    and nc.match_dismissed = false
    and (
      (nc.email is not null and u.email is not null
        and lower(nc.email) = lower(u.email))
      or (
        nc.phone is not null and p.phone is not null
        and length(regexp_replace(nc.phone, '\D', '', 'g')) >= 7
        and regexp_replace(nc.phone, '\D', '', 'g') = regexp_replace(p.phone, '\D', '', 'g')
      )
    )
  order by nc.id, match_on; -- 'email' sorts before 'phone' → prefer the email match
$$;

comment on function public.find_contact_matches(uuid) is
  'For one owner, list their unlinked/undismissed network_contacts that hard-match a member profile by email or phone. SECURITY DEFINER (reads auth.users.email); owner-scoped by the p_owner argument. See docs/NETWORK-CRM.md.';

revoke all on function public.find_contact_matches(uuid) from public;
grant execute on function public.find_contact_matches(uuid) to authenticated, service_role;

-- Person identity stitch (ADR-130, docs/NETWORK-CRM.md "Unified person").
--
-- One human can show up as up to THREE records, all joined by lowercased email:
--   • profiles         — the member (login + public profile)            [members only]
--   • contacts         — the unified CRM/marketing record (lead → member) [the join hub]
--   • network_contacts — a steward's private capture (card scan / manual) [0..n]
--
-- Going-forward the links were only set on the happy path (scan → contacts;
-- signup → profile). This backfills the links that already exist in the data so
-- the CRM "User Stats" page can group everything that describes one person — and
-- so the locality/connection-scoped people search can resolve a capture's member.
--
-- Idempotent (fills NULLs only) and additive (no column changes; three indexes).
-- Email lives in auth.users (profiles don't store it), so member matches join
-- through auth.users like the signup trigger (20240222000000_contacts_backfill).

-- 1. Stitch a CRM contact to its member profile by email. Covers leads captured
--    before the person signed up, and any member that predates the sync trigger.
update public.contacts c
set profile_id = p.id, updated_at = now()
from public.profiles p
join auth.users u on u.id = p.auth_user_id
where c.profile_id is null
  and u.email is not null
  and lower(u.email) = lower(c.email);

-- 2. Stitch each private capture to the shared CRM contact with the same email.
update public.network_contacts nc
set linked_contact_id = c.id, updated_at = now()
from public.contacts c
where nc.linked_contact_id is null
  and nc.email is not null
  and lower(c.email) = lower(nc.email);

-- 3. Stitch each private capture to a member profile when that person is a member.
update public.network_contacts nc
set linked_profile_id = p.id, updated_at = now()
from public.profiles p
join auth.users u on u.id = p.auth_user_id
where nc.linked_profile_id is null
  and nc.email is not null
  and u.email is not null
  and lower(u.email) = lower(nc.email);

-- Lookup paths added by the unified person view + people search:
--   • resolve a capture → its CRM contact / member profile,
--   • find network-visible captures in a locality (connection + locality scope).
create index if not exists network_contacts_linked_contact_idx
  on public.network_contacts (linked_contact_id);
create index if not exists network_contacts_linked_profile_idx
  on public.network_contacts (linked_profile_id);
create index if not exists network_contacts_network_city_idx
  on public.network_contacts (lower(city)) where visibility = 'network';

-- Network Profiles · card capture upgrade (docs/NETWORK-CRM.md, ADR-098).
--
-- The Profile Creator now keeps the card itself, not just the harvest:
--   • details          — the rich, flexible harvest of everything printed on the
--                        card (phones, emails, addresses, services,
--                        certifications, hours, links, other). Mirrors
--                        events.details (20260613140000_event_details).
--   • card_front_path  — the deskewed FRONT of the card, kept on file.
--   • card_back_path   — the deskewed BACK of the card, when captured.
--   • logo_path        — the cropped company logo (avatar fallback + org image).
--
-- All paths are keys in the PRIVATE network-contacts bucket (signed URLs only;
-- path convention {auth_user_id}/{file}, owner-scoped by the existing storage
-- policies). RLS on network_contacts already owner-scopes the row. Additive and
-- idempotent; existing rows keep working with the defaults.

alter table public.network_contacts
  add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.network_contacts
  add column if not exists card_front_path text;
alter table public.network_contacts
  add column if not exists card_back_path text;
alter table public.network_contacts
  add column if not exists logo_path text;

comment on column public.network_contacts.details is
  'Rich flexible harvest from the card scan: { phones, emails, addresses, services, certifications, hours, links, other }, all optional, validated by coerceContactDetails. See lib/connections/types.ts (ContactDetails).';
comment on column public.network_contacts.card_front_path is
  'Deskewed front of the captured card. Key in the PRIVATE network-contacts bucket; render via a server-minted signed URL.';
comment on column public.network_contacts.card_back_path is
  'Deskewed back of the captured card, when one was photographed. Key in the PRIVATE network-contacts bucket.';
comment on column public.network_contacts.logo_path is
  'Cropped company logo from the card (avatar fallback, shown beside the company). Key in the PRIVATE network-contacts bucket.';

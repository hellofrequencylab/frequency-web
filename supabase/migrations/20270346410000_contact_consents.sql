-- EMAIL-085: a permission record for every contact Email Studio may market to.
--
-- THE GAP. contacts.consent_state says whether a contact is subscribed, but nothing records HOW they came to be.
-- Resend's Acceptable Use Policy asks for explicit opt-in, and "assumed until they unsubscribe" is named as not
-- consent. EMAIL-082 already stops brand campaigns reaching the imported list unless a contact is subscribed;
-- this adds the evidence behind that word.
--
-- THE FIX. One row per yes: which contact, which Space's list, where (source, page, form), when, and the exact
-- wording the person saw. Written by the /subscribe confirm click (lib/crm/optin/store.ts) and by a confirmed
-- list import (lib/crm/import/commit.ts, the operator's attestation). Read by lib/email-studio/consent.ts: a
-- contact with no Frequency account is mailable by Email Studio only when it has one of these rows. Members
-- with an account are unchanged (their consent ledger is consent_records, and they get opt-out lifecycle mail).
--
-- No backfill on purpose. A record we did not capture is not a record. In production on 2026-11-25 no imported
-- contact was subscribed, so no audience shrinks today.
--
-- Service-role only: RLS on with no policy, explicit revokes (ADR-959, ADR-964); listed in
-- scripts/rls-deny-all.txt. Additive and idempotent (safe to re-run).
-- Rollback: drop table if exists public.contact_consents;

create table if not exists public.contact_consents (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  space_id    uuid references public.spaces(id) on delete cascade,
  source      text not null check (char_length(source) between 1 and 64),
  page_path   text check (page_path is null or char_length(page_path) <= 512),
  form_key    text check (form_key is null or char_length(form_key) <= 64),
  wording     text not null check (char_length(wording) between 1 and 2000),
  captured_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

comment on table public.contact_consents is
  'EMAIL-085: one row per marketing yes (source, page or form, time, the wording shown). A contact with no account is mailable by Email Studio only with a row here. Service-role only.';

create index if not exists contact_consents_contact_idx on public.contact_consents (contact_id, captured_at desc);

alter table public.contact_consents enable row level security;
-- No policies: written and read through the service-role client only.
revoke all on table public.contact_consents from public, anon, authenticated;
grant select, insert, delete on table public.contact_consents to service_role;

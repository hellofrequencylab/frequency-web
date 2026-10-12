-- EMAIL-022 (owner ruling 2026-10-12): every Space that messages through Frequency can have a public
-- reply address at its Space, hello@<slug>.<SPACE_EMAIL_INBOX_ROOT>. One row per Space, one domain per
-- row. Service-role only: the row carries provider ids and the DNS records the platform wrote, and the
-- inbound webhook is the only reader. The Settings card reads it through a server component.
create table public.space_inbox_addresses (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null unique references public.spaces(id) on delete cascade,
 domain text not null unique check(domain=lower(domain) and domain ~ '^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'),
 local_part text not null default 'hello' check(local_part ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
 provider_domain_id text,
 state text not null default 'pending' check(state in ('pending','verified','failed','paused')),
 dns_records jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),
 verified_at timestamptz,
 updated_at timestamptz not null default now()
);
comment on table public.space_inbox_addresses is
 'EMAIL-022: the per-Space public inbox address (hello@<slug>.<root>). state: pending (DNS written, provider not yet verified), verified (receiving live), failed (provider refused), paused (operator hold: inbound quarantines, outbound falls back to Frequency). Service-role only.';
alter table public.space_inbox_addresses enable row level security;
revoke all on public.space_inbox_addresses from public,anon,authenticated;
grant all on public.space_inbox_addresses to service_role;

-- A message to an unknown or not-yet-verified Space address quarantines like a bad alias (fingerprints
-- only, never the message). Two new reasons join the bounded set.
alter table public.space_email_reply_quarantine drop constraint space_email_reply_quarantine_reason_check;
alter table public.space_email_reply_quarantine add constraint space_email_reply_quarantine_reason_check
 check(reason in ('ambiguous_alias','malformed_alias','unknown_or_revoked_alias','invalid_alias_proof','tenant_mapping_mismatch','inbox_address_unknown','inbox_address_unverified'));

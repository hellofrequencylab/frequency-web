-- Additive registry: caller writes never attest provider verification.
create table public.space_email_domains (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  domain text not null unique check (domain = lower(domain) and domain !~ '[[:space:]@/]' and length(domain) between 3 and 253),
  provider_domain_id text not null unique,
  sending_verified boolean not null default false,
  last_verified_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, space_id),
  check (not sending_verified or last_verified_at is not null)
);
create table public.space_email_identities (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  domain_id uuid not null,
  local_part text not null check (local_part ~ '^[a-z0-9][a-z0-9._+-]{0,63}$'),
  display_name text not null check (length(display_name) between 1 and 78 and display_name !~ '[[:cntrl:]<>]'),
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (domain_id, space_id) references public.space_email_domains(id, space_id),
  unique (domain_id, local_part)
);
alter table public.space_email_domains enable row level security;
alter table public.space_email_identities enable row level security;
revoke all on public.space_email_domains, public.space_email_identities from anon, authenticated;
grant select on public.space_email_domains, public.space_email_identities to authenticated;
grant all on public.space_email_domains, public.space_email_identities to service_role;
create policy space_email_domains_owner_read on public.space_email_domains for select to authenticated
using (exists (select 1 from public.spaces s join public.profiles p on p.id = s.owner_profile_id
  where s.id = space_id and p.auth_user_id = auth.uid()));
create policy space_email_identities_owner_read on public.space_email_identities for select to authenticated
using (exists (select 1 from public.spaces s join public.profiles p on p.id = s.owner_profile_id
  where s.id = space_id and p.auth_user_id = auth.uid()));

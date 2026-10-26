-- Private, generation/revision-bound OAuth credentials. No browser role can read or write them.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
create table if not exists public.space_discovery_connections (
  space_id uuid not null references public.spaces(id) on delete cascade,
  provider text not null check (provider in ('google_search_console','bing_webmaster')),
  id uuid not null unique,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  consent_id text not null check (consent_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  property_url text not null check (length(property_url) between 1 and 2048),
  property_scope text not null check (property_scope in ('dedicated_property','page_urls')),
  state text not null check (state in ('pending','exchanging','connected','revoked')),
  nonce_hash text check (nonce_hash is null or nonce_hash ~ '^[0-9a-f]{64}$'),
  nonce_expires_at timestamptz,
  pending_ciphertext text check (pending_ciphertext is null or (length(pending_ciphertext) <= 40000 and pending_ciphertext like 'v1.%')),
  tokens_ciphertext text check (tokens_ciphertext is null or (length(tokens_ciphertext) <= 40000 and tokens_ciphertext like 'v1.%')),
  expires_at timestamptz,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (space_id,provider),
  constraint discovery_connection_scope check (provider <> 'bing_webmaster' or property_scope = 'dedicated_property'),
  constraint discovery_connection_state check (
    (state = 'pending' and nonce_hash is not null and nonce_expires_at is not null and pending_ciphertext is not null and tokens_ciphertext is null and expires_at is null and cardinality(scopes)=0)
    or (state = 'exchanging' and nonce_hash is null and nonce_expires_at is not null and pending_ciphertext is not null and tokens_ciphertext is null and expires_at is null and cardinality(scopes)=0)
    or (state = 'connected' and nonce_hash is null and nonce_expires_at is null and pending_ciphertext is null and tokens_ciphertext is not null and expires_at is not null and cardinality(scopes)>0)
    or (state = 'revoked' and nonce_hash is null and nonce_expires_at is null and pending_ciphertext is null and tokens_ciphertext is null and expires_at is null and cardinality(scopes)=0)
  ),
  constraint discovery_connection_nonce_lifetime check (nonce_expires_at is null or nonce_expires_at <= updated_at + interval '10 minutes')
);
create index if not exists space_discovery_connections_actor_profile_id_idx on public.space_discovery_connections (actor_profile_id);
alter table public.space_discovery_connections enable row level security;
revoke all on table public.space_discovery_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.space_discovery_connections to service_role;
comment on table public.space_discovery_connections is 'Service-only encrypted OAuth connection generations. Fresh direct Space edit authority and exact active discovery consent are required by server readers. Tokens/PKCE ciphertext use dedicated AES-256-GCM key and authenticated Space/provider/generation/actor/consent/property bindings. Revision compare-and-swap prevents stale refresh or callback resurrection. No public preferences or browser grants.';
commit;

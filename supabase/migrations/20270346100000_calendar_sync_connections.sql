-- SPACE CALENDAR SYNC CONNECTIONS (LIVE-1179, ADR-1976). One row per Space per provider: the
-- Space's connected Google (later Outlook) calendar for two-way sync, behind CALENDAR_SYNC_ENABLED.
--
-- WHAT IS STORED. OAuth tokens and the pending PKCE verifier are SEALED before they reach this table
-- (AES-256-GCM, CALENDAR_SYNC_ENCRYPTION_KEY, bound to space/provider/connection id; see
-- lib/calendar-sync/seal.ts). Nothing here is a usable credential without the server key. A new
-- connect writes a new `id`, so an old ciphertext can never open against a newer connection.
-- `conflicts` is the last sync's list of external edits waiting on the team (ids, titles, a kind),
-- capped by the app at 50.
--
-- ACCESS. Only the Space's owner and active admins, through the caller's own session
-- (private.is_space_admin). Platform staff and editors see nothing. No anon grant.
--
-- House style: additive + idempotent (SAFE to re-run). Reached untyped until lib/database.types.ts
-- regenerates (ADR-246). Rollback: drop table public.space_calendar_sync_connections; then remove the
-- mirrored busy rows: delete from public.space_calendar_entries where source_kind = 'calendar_sync'.

create table if not exists public.space_calendar_sync_connections (
  id                 uuid primary key,
  space_id           uuid not null references public.spaces(id) on delete cascade,
  provider           text not null check (provider in ('google', 'outlook')),
  state              text not null check (state in ('pending', 'connected')),
  calendar_id        text not null default 'primary' check (char_length(calendar_id) between 1 and 300),
  calendar_label     text check (calendar_label is null or char_length(calendar_label) <= 300),
  nonce_hash         text check (nonce_hash is null or nonce_hash ~ '^[0-9a-f]{64}$'),
  nonce_expires_at   timestamptz,
  pending_ciphertext text check (pending_ciphertext is null or (char_length(pending_ciphertext) <= 40000 and pending_ciphertext like 'v1.%')),
  tokens_ciphertext  text check (tokens_ciphertext is null or (char_length(tokens_ciphertext) <= 40000 and tokens_ciphertext like 'v1.%')),
  conflicts          jsonb not null default '[]'::jsonb check (jsonb_typeof(conflicts) = 'array'),
  last_synced_at     timestamptz,
  last_error         text check (last_error is null or char_length(last_error) <= 300),
  connected_by       uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint space_calendar_sync_connections_one_per_provider unique (space_id, provider),
  constraint space_calendar_sync_connections_state_shape check (
    (state = 'pending' and nonce_hash is not null and nonce_expires_at is not null and pending_ciphertext is not null and tokens_ciphertext is null)
    or (state = 'connected' and nonce_hash is null and pending_ciphertext is null and tokens_ciphertext is not null)
  )
);

create index if not exists space_calendar_sync_connections_connected_by_idx
  on public.space_calendar_sync_connections (connected_by);

comment on table public.space_calendar_sync_connections is
  'Two-way calendar sync per Space and provider (LIVE-1179, ADR-1976). Tokens sealed with CALENDAR_SYNC_ENCRYPTION_KEY. Owner and admins only, on the caller session.';

alter table public.space_calendar_sync_connections enable row level security;

drop policy if exists space_calendar_sync_connections_read on public.space_calendar_sync_connections;
create policy space_calendar_sync_connections_read on public.space_calendar_sync_connections
  for select to authenticated using (private.is_space_admin(space_id));

drop policy if exists space_calendar_sync_connections_insert on public.space_calendar_sync_connections;
create policy space_calendar_sync_connections_insert on public.space_calendar_sync_connections
  for insert to authenticated with check (private.is_space_admin(space_id));

drop policy if exists space_calendar_sync_connections_update on public.space_calendar_sync_connections;
create policy space_calendar_sync_connections_update on public.space_calendar_sync_connections
  for update to authenticated
  using (private.is_space_admin(space_id))
  with check (private.is_space_admin(space_id));

drop policy if exists space_calendar_sync_connections_delete on public.space_calendar_sync_connections;
create policy space_calendar_sync_connections_delete on public.space_calendar_sync_connections
  for delete to authenticated using (private.is_space_admin(space_id));

revoke all on table public.space_calendar_sync_connections from anon;

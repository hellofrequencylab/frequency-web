-- Vera guided launch: the tables behind "Get a Free Spotlight" (LIVE-1550, VLS-01 with VLS-12, VLS-23 and
-- VLS-26 folded in so the whole Launch system crosses the migration gate once). See
-- docs/BUILD-BACKLOG.json for status; this file explains the schema, it does not track the work.
--
-- 1. space_launch: one row per launch a person has started. The cursor and every step's state live
--    here so an abandoned launch resumes where it stopped. One ACTIVE launch per owner (a launch is
--    active until it is completed or cancelled). cancelled_at can only be set after cancel_requested_at,
--    which is the database half of the double-confirm cancel; the typed STOP is the app half.
-- 2. launch_sources: what the person handed over (a website link, an outline, a pasted list, an email
--    list, a flyer). Metadata only: kind, label, size. The extracted text is never stored whole.
-- 3. launch_facts: the cited facts Vera arranged from a source. A fact with no verbatim snippet and
--    no origin is refused by the schema, so nothing on the shelf is invented. Removing a source
--    removes its facts.
-- 4. launch_list_attestations: append-only record of the consent answer a person gave before a list
--    went in (wording version, answer, time). Nobody edits or deletes it.
-- 5. launch_email_log: one row per reminder sent, unique by (launch, kind), so a cron that runs twice
--    cannot send twice. Service role only.
--
-- Owner-only on the session client: the launch tables are readable and writable by the profile that
-- owns the launch, nobody else. No money moves. No existing table changes. Additive and idempotent.
-- ROLLBACK (the tables hold no one else's data, so dropping them is safe while the switches are off):
--   drop table if exists public.launch_email_log;
--   drop table if exists public.launch_list_attestations;
--   drop table if exists public.launch_facts;
--   drop table if exists public.launch_sources;
--   drop table if exists public.space_launch;

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table if not exists public.space_launch (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete set null,
  niche text check (niche is null or niche ~ '^[a-z][a-z-]{0,39}$'),
  intents text[] not null default '{}' check (cardinality(intents) <= 12),
  stage text not null default 'found' check (stage in ('found','gather','keep')),
  current_step text not null default 'spotlight' check (current_step ~ '^[a-z][a-z_]{0,31}$'),
  steps jsonb not null default '{}'::jsonb check (jsonb_typeof(steps) = 'object' and pg_column_size(steps) <= 16384),
  minimized boolean not null default false,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  constraint space_launch_cancel_needs_request check (cancelled_at is null or cancel_requested_at is not null),
  constraint space_launch_one_ending check (cancelled_at is null or completed_at is null)
);
create unique index if not exists space_launch_one_active_per_owner
  on public.space_launch (owner_id) where cancelled_at is null and completed_at is null;
create index if not exists space_launch_owner_idx on public.space_launch (owner_id, updated_at desc);
create index if not exists space_launch_space_idx on public.space_launch (space_id);
alter table public.space_launch enable row level security;
revoke all on table public.space_launch from public, anon, authenticated;
grant select, insert, update on table public.space_launch to authenticated;
grant select, insert, update, delete on table public.space_launch to service_role;
drop policy if exists "space_launch: owner reads" on public.space_launch;
create policy "space_launch: owner reads" on public.space_launch
  for select to authenticated using (owner_id = (select private.get_my_profile_id()));
drop policy if exists "space_launch: owner starts" on public.space_launch;
create policy "space_launch: owner starts" on public.space_launch
  for insert to authenticated with check (owner_id = (select private.get_my_profile_id()));
drop policy if exists "space_launch: owner updates" on public.space_launch;
create policy "space_launch: owner updates" on public.space_launch
  for update to authenticated
  using (owner_id = (select private.get_my_profile_id()))
  with check (owner_id = (select private.get_my_profile_id()));
comment on table public.space_launch is 'One Vera guided launch per person at a time. steps is {stepId:{state,startedAt,publishedAt,skippedAt,ref}}. cancelled_at needs cancel_requested_at first (double confirm). Owner-only on the session client; no pixel ever sees a row.';

create table if not exists public.launch_sources (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references public.space_launch(id) on delete cascade,
  kind text not null check (kind in ('website','outline','list','email_list','flyer')),
  label text not null check (length(label) between 1 and 200),
  size_bytes integer not null default 0 check (size_bytes between 0 and 5242880),
  char_count integer not null default 0 check (char_count between 0 and 200000),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists launch_sources_launch_idx on public.launch_sources (launch_id);
alter table public.launch_sources enable row level security;
revoke all on table public.launch_sources from public, anon, authenticated;
grant select, insert, update, delete on table public.launch_sources to authenticated;
grant select, insert, update, delete on table public.launch_sources to service_role;
drop policy if exists "launch_sources: owner reads" on public.launch_sources;
create policy "launch_sources: owner reads" on public.launch_sources
  for select to authenticated
  using (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())));
drop policy if exists "launch_sources: owner adds" on public.launch_sources;
create policy "launch_sources: owner adds" on public.launch_sources
  for insert to authenticated
  with check (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())));
drop policy if exists "launch_sources: owner updates" on public.launch_sources;
create policy "launch_sources: owner updates" on public.launch_sources
  for update to authenticated
  using (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())))
  with check (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())));
drop policy if exists "launch_sources: owner removes" on public.launch_sources;
create policy "launch_sources: owner removes" on public.launch_sources
  for delete to authenticated
  using (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())));
comment on table public.launch_sources is 'What a person handed Vera during a launch: kind, label and size only. The text is read, cited into launch_facts and dropped. expires_at is set when a launch is cancelled (30 days).';

create table if not exists public.launch_facts (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references public.space_launch(id) on delete cascade,
  source_id uuid not null references public.launch_sources(id) on delete cascade,
  slot text not null check (slot in ('name','tagline','intro','story','contact','hours','offers','events','people','links')),
  value text not null check (length(value) between 1 and 2000),
  snippet text not null check (length(snippet) between 1 and 1000),
  origin text not null check (length(origin) between 1 and 500),
  state text not null default 'suggested' check (state in ('suggested','accepted','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists launch_facts_launch_idx on public.launch_facts (launch_id);
create index if not exists launch_facts_source_idx on public.launch_facts (source_id);
alter table public.launch_facts enable row level security;
revoke all on table public.launch_facts from public, anon, authenticated;
grant select, insert, update, delete on table public.launch_facts to authenticated;
grant select, insert, update, delete on table public.launch_facts to service_role;
drop policy if exists "launch_facts: owner reads" on public.launch_facts;
create policy "launch_facts: owner reads" on public.launch_facts
  for select to authenticated
  using (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())));
drop policy if exists "launch_facts: owner adds" on public.launch_facts;
create policy "launch_facts: owner adds" on public.launch_facts
  for insert to authenticated
  with check (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())));
drop policy if exists "launch_facts: owner updates" on public.launch_facts;
create policy "launch_facts: owner updates" on public.launch_facts
  for update to authenticated
  using (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())))
  with check (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())));
drop policy if exists "launch_facts: owner removes" on public.launch_facts;
create policy "launch_facts: owner removes" on public.launch_facts
  for delete to authenticated
  using (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())));
comment on table public.launch_facts is 'Cited facts arranged from a launch source. snippet is the person''s own words, verbatim; origin says where they came from. No snippet and origin, no row.';

create table if not exists public.launch_list_attestations (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references public.space_launch(id) on delete cascade,
  source_id uuid references public.launch_sources(id) on delete set null,
  wording_version text not null check (wording_version ~ '^[a-z0-9._-]{1,40}$'),
  answer text not null check (answer in ('confirmed','declined')),
  attested_at timestamptz not null default now()
);
create index if not exists launch_list_attestations_launch_idx on public.launch_list_attestations (launch_id);
create index if not exists launch_list_attestations_source_idx on public.launch_list_attestations (source_id);
alter table public.launch_list_attestations enable row level security;
revoke all on table public.launch_list_attestations from public, anon, authenticated;
grant select, insert on table public.launch_list_attestations to authenticated;
grant select, insert, update, delete on table public.launch_list_attestations to service_role;
drop policy if exists "launch_list_attestations: owner reads" on public.launch_list_attestations;
create policy "launch_list_attestations: owner reads" on public.launch_list_attestations
  for select to authenticated
  using (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())));
drop policy if exists "launch_list_attestations: owner attests" on public.launch_list_attestations;
create policy "launch_list_attestations: owner attests" on public.launch_list_attestations
  for insert to authenticated
  with check (launch_id in (select l.id from public.space_launch l where l.owner_id = (select private.get_my_profile_id())));
comment on table public.launch_list_attestations is 'Append-only: the consent answer a person gave before an email list went in (wording version, answer, time). The owner can read and add, never edit or delete.';

create table if not exists public.launch_email_log (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references public.space_launch(id) on delete cascade,
  trigger_kind text not null check (trigger_kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  message_ref text check (message_ref is null or length(message_ref) <= 200),
  sent_at timestamptz not null default now(),
  constraint launch_email_log_once unique (launch_id, trigger_kind)
);
alter table public.launch_email_log enable row level security;
revoke all on table public.launch_email_log from public, anon, authenticated;
grant select, insert, update, delete on table public.launch_email_log to service_role;
comment on table public.launch_email_log is 'Service-only reminder log. One row per (launch, trigger_kind), so a cron that runs twice cannot send twice.';

commit;

-- FH-006: Frequency Hunts transactional records (Tier 0, Frequency Hunts Build Plan).
--
-- Runs, claims, progress, command keys, an append-only audit trail and compensations. The claim
-- RPC that writes them is a later row (FH-010); this migration lays down the records and the keys
-- that make a double credit and a replayed command impossible at the database, whoever writes.
--
--   * one credit per (run, mission): hunt_progress is keyed (run_id, mission_key)
--   * one claim per (run, mission, evidence): a replayed proof cannot add a second row
--   * one command per (actor, action, key): a reused key with another payload is a conflict the
--     writer detects by comparing request_hash against the stored one
--   * every child carries hunt_id and a composite FK, so a run, claim or progress row cannot point
--     at another Hunt's version or run
--
-- Service role only, like the FH-005 tables: RLS on, no policy, browser grants revoked.
-- Additive and idempotent. Teams (a run owned by a team) arrive with the team tier.

begin;

create table if not exists public.hunt_runs (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  version_id uuid not null,
  subject_profile_id uuid not null references public.profiles(id) on delete cascade,
  attempt_no integer not null default 1 check (attempt_no >= 1),
  state text not null default 'active' check (state in ('active','completed','expired','withdrawn')),
  revision integer not null default 1 check (revision >= 1),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  foreign key (version_id, hunt_id) references public.hunt_versions(id, hunt_id) on delete restrict,
  unique (id, hunt_id),
  unique (id, version_id),
  unique (version_id, subject_profile_id, attempt_no),
  check (state <> 'completed' or completed_at is not null)
);
create index if not exists hunt_runs_version_idx on public.hunt_runs(version_id, hunt_id);
create index if not exists hunt_runs_hunt_idx on public.hunt_runs(hunt_id);
create index if not exists hunt_runs_subject_activity_idx on public.hunt_runs(subject_profile_id, last_activity_at desc);

create table if not exists public.hunt_claims (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  run_id uuid not null,
  version_id uuid not null,
  mission_key text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  evidence_id text not null check (char_length(evidence_id) between 1 and 200),
  state text not null default 'submitted'
    check (state in ('submitted','accepted','rejected','needs_review','reversed')),
  assurance text not null default 'signed_node'
    check (assurance in ('none','signed_node','staff','event_door')),
  policy_result jsonb not null default '{}'::jsonb,
  reason text,
  idempotency_key text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (run_id, hunt_id) references public.hunt_runs(id, hunt_id) on delete cascade,
  foreign key (run_id, version_id) references public.hunt_runs(id, version_id) on delete cascade,
  foreign key (version_id, mission_key) references public.hunt_missions(version_id, mission_key) on delete restrict,
  unique (run_id, mission_key, evidence_id),
  unique (id, run_id)
);
create index if not exists hunt_claims_run_idx on public.hunt_claims(run_id, hunt_id);
create index if not exists hunt_claims_run_version_idx on public.hunt_claims(run_id, version_id);
create index if not exists hunt_claims_mission_idx on public.hunt_claims(version_id, mission_key);
create index if not exists hunt_claims_actor_idx on public.hunt_claims(actor_profile_id, created_at desc);
create index if not exists hunt_claims_reviewed_by_idx on public.hunt_claims(reviewed_by) where reviewed_by is not null;
create index if not exists hunt_claims_review_queue_idx on public.hunt_claims(hunt_id, created_at) where state = 'needs_review';

create table if not exists public.hunt_progress (
  run_id uuid not null,
  mission_key text not null,
  hunt_id uuid not null,
  version_id uuid not null,
  credited_claim_id uuid not null,
  disposition text not null default 'credited' check (disposition in ('credited','reversed','void')),
  accepted_at timestamptz not null default now(),
  revision integer not null default 1 check (revision >= 1),
  primary key (run_id, mission_key),
  foreign key (run_id, hunt_id) references public.hunt_runs(id, hunt_id) on delete cascade,
  foreign key (version_id, mission_key) references public.hunt_missions(version_id, mission_key) on delete restrict,
  foreign key (credited_claim_id, run_id) references public.hunt_claims(id, run_id) on delete restrict
);
create index if not exists hunt_progress_run_hunt_idx on public.hunt_progress(run_id, hunt_id);
create index if not exists hunt_progress_mission_idx on public.hunt_progress(version_id, mission_key);
create index if not exists hunt_progress_claim_idx on public.hunt_progress(credited_claim_id, run_id);

create table if not exists public.hunt_command_keys (
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 80),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  request_hash text not null check (char_length(request_hash) between 16 and 128),
  hunt_id uuid references public.hunts(id) on delete cascade,
  response_ref jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  primary key (actor_profile_id, action, idempotency_key)
);
create index if not exists hunt_command_keys_hunt_idx on public.hunt_command_keys(hunt_id) where hunt_id is not null;
create index if not exists hunt_command_keys_expiry_idx on public.hunt_command_keys(expires_at);

create table if not exists public.hunt_audit (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete cascade,
  run_id uuid references public.hunt_runs(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_kind text not null check (char_length(target_kind) between 1 and 40),
  target_id text,
  before_state jsonb,
  after_state jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);
create index if not exists hunt_audit_hunt_idx on public.hunt_audit(hunt_id, created_at desc);
create index if not exists hunt_audit_run_idx on public.hunt_audit(run_id) where run_id is not null;
create index if not exists hunt_audit_actor_idx on public.hunt_audit(actor_profile_id) where actor_profile_id is not null;

create table if not exists public.hunt_compensations (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  run_id uuid not null,
  claim_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  appeal_state text not null default 'none' check (appeal_state in ('none','open','upheld','overturned')),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (run_id, hunt_id) references public.hunt_runs(id, hunt_id) on delete cascade,
  foreign key (claim_id, run_id) references public.hunt_claims(id, run_id) on delete restrict
);
create index if not exists hunt_compensations_run_idx on public.hunt_compensations(run_id, hunt_id);
create index if not exists hunt_compensations_claim_idx on public.hunt_compensations(claim_id, run_id);
create index if not exists hunt_compensations_created_by_idx on public.hunt_compensations(created_by) where created_by is not null;
create index if not exists hunt_compensations_approved_by_idx on public.hunt_compensations(approved_by) where approved_by is not null;

alter table public.hunt_runs enable row level security;
revoke all on table public.hunt_runs from public, anon, authenticated;
grant all on public.hunt_runs to service_role;
alter table public.hunt_claims enable row level security;
revoke all on table public.hunt_claims from public, anon, authenticated;
grant all on public.hunt_claims to service_role;
alter table public.hunt_progress enable row level security;
revoke all on table public.hunt_progress from public, anon, authenticated;
grant all on public.hunt_progress to service_role;
alter table public.hunt_command_keys enable row level security;
revoke all on table public.hunt_command_keys from public, anon, authenticated;
grant all on public.hunt_command_keys to service_role;
alter table public.hunt_audit enable row level security;
revoke all on table public.hunt_audit from public, anon, authenticated;
grant all on public.hunt_audit to service_role;
alter table public.hunt_compensations enable row level security;
revoke all on table public.hunt_compensations from public, anon, authenticated;
grant all on public.hunt_compensations to service_role;

comment on table public.hunt_runs is 'FH-006 Frequency Hunts: one member''s attempt at one published version. Service role only.';
comment on table public.hunt_claims is 'FH-006: a proof submitted for a mission. Unique per run, mission and evidence so a replayed proof adds no row.';
comment on table public.hunt_progress is 'FH-006: at most one credit per run and mission, pointing at the claim that earned it.';
comment on table public.hunt_command_keys is 'FH-006: idempotency keys. A reused key with a different request_hash is a conflict the writer must refuse.';

commit;

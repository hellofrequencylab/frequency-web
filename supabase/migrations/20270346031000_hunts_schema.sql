-- FH-005: the versioned Frequency Hunts schema (Tier 0, Frequency Hunts Build Plan).
--
-- A Hunt is a resident- or Space-owned game with immutable published versions. This migration is
-- the authoring half only: hunts, roles, partner venues, versions, missions, rule groups, physical
-- nodes, placements and the mission/placement join. Runs, claims, progress, the outbox and every
-- grant of a reward are FH-006 and later. Nothing here reads or writes the older Regulars hunts
-- (loyalty_hunts*) or the QR campaign tables; those keep their routes and history.
--
-- Every table is service role only, like loyalty_hunts: RLS on, no policy, all browser grants
-- revoked. The app resolves the actor on the server and writes through lib/hunts after its own
-- gate. Every child carries hunt_id and a composite FK, so a mission, rule group or placement can
-- never point at another Hunt's version. Additive and idempotent.

begin;

create table if not exists public.hunts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  visibility text not null default 'private' check (visibility in ('private','unlisted','public')),
  owner_profile_id uuid references public.profiles(id) on delete restrict,
  owner_space_id uuid references public.spaces(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','scheduled','live','paused','ended','cancelled','archived')),
  current_version_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(owner_profile_id, owner_space_id) = 1)
);
create index if not exists hunts_owner_profile_idx on public.hunts(owner_profile_id) where owner_profile_id is not null;
create index if not exists hunts_owner_space_idx on public.hunts(owner_space_id) where owner_space_id is not null;
create index if not exists hunts_created_by_idx on public.hunts(created_by) where created_by is not null;
create index if not exists hunts_status_visibility_idx on public.hunts(status, visibility);
create index if not exists hunts_current_version_idx on public.hunts(current_version_id) where current_version_id is not null;

create table if not exists public.hunt_versions (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  schema_version integer not null default 1 check (schema_version >= 1),
  status text not null default 'draft' check (status in ('draft','validated','published','superseded')),
  content_hash text,
  timezone text not null default 'America/Los_Angeles',
  starts_at timestamptz,
  ends_at timestamptz,
  policy jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (hunt_id, version_no),
  unique (hunt_id, id),
  unique (id, hunt_id),
  check (starts_at is null or ends_at is null or ends_at > starts_at),
  check (status not in ('published','superseded') or (content_hash is not null and published_at is not null))
);
create index if not exists hunt_versions_created_by_idx on public.hunt_versions(created_by) where created_by is not null;

-- The current version must belong to the same Hunt (MATCH SIMPLE: a draft Hunt has none yet).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunts_current_version_same_hunt_fkey') then
    alter table public.hunts
      add constraint hunts_current_version_same_hunt_fkey
      foreign key (id, current_version_id) references public.hunt_versions(hunt_id, id);
  end if;
end $$;

create table if not exists public.hunt_roles (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','operator')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
create unique index if not exists hunt_roles_one_active_idx
  on public.hunt_roles(hunt_id, profile_id, role) where revoked_at is null;
create index if not exists hunt_roles_hunt_idx on public.hunt_roles(hunt_id);
create index if not exists hunt_roles_profile_idx on public.hunt_roles(profile_id);
create index if not exists hunt_roles_granted_by_idx on public.hunt_roles(granted_by) where granted_by is not null;

create table if not exists public.hunt_partners (
  hunt_id uuid not null references public.hunts(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited','accepted','declined','expired','withdrawn','suspended')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_by uuid references public.profiles(id) on delete set null,
  effective_at timestamptz,
  revoked_at timestamptz,
  terms_version text,
  permitted_roles text[] not null default '{}',
  primary key (hunt_id, space_id)
);
create index if not exists hunt_partners_space_idx on public.hunt_partners(space_id, status);
create index if not exists hunt_partners_invited_by_idx on public.hunt_partners(invited_by) where invited_by is not null;
create index if not exists hunt_partners_accepted_by_idx on public.hunt_partners(accepted_by) where accepted_by is not null;

create table if not exists public.hunt_missions (
  version_id uuid not null,
  hunt_id uuid not null,
  mission_key text not null check (mission_key ~ '^[a-z0-9_-]{1,40}$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  visible_body text,
  locked_teaser text,
  kind text not null default 'visit' check (kind in ('visit','staff','answer','event','optional')),
  required_assurance text not null default 'signed_node'
    check (required_assurance in ('none','signed_node','staff','event_door')),
  opens_at timestamptz,
  closes_at timestamptz,
  max_credits smallint not null default 1 check (max_credits = 1),
  choice_group text,
  fallback_group text,
  answer_hash text,
  primary key (version_id, mission_key),
  foreign key (version_id, hunt_id) references public.hunt_versions(id, hunt_id) on delete cascade,
  check (opens_at is null or closes_at is null or closes_at > opens_at)
);
create index if not exists hunt_missions_hunt_idx on public.hunt_missions(hunt_id);

create table if not exists public.hunt_rule_groups (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null,
  hunt_id uuid not null,
  target_mission_key text,
  target_finish boolean not null default false,
  logic text not null check (logic in ('all','any','count')),
  min_count integer,
  group_key text,
  foreign key (version_id, hunt_id) references public.hunt_versions(id, hunt_id) on delete cascade,
  foreign key (version_id, target_mission_key) references public.hunt_missions(version_id, mission_key) on delete cascade,
  unique (id, version_id),
  check ((target_mission_key is not null) <> target_finish),
  check ((logic = 'count' and min_count is not null and min_count >= 1) or (logic <> 'count' and min_count is null))
);
create index if not exists hunt_rule_groups_version_idx on public.hunt_rule_groups(version_id, hunt_id);
create index if not exists hunt_rule_groups_target_idx on public.hunt_rule_groups(version_id, target_mission_key);

create table if not exists public.hunt_rule_group_members (
  group_id uuid not null,
  version_id uuid not null,
  member_mission_key text not null,
  primary key (group_id, member_mission_key),
  foreign key (group_id, version_id) references public.hunt_rule_groups(id, version_id) on delete cascade,
  foreign key (version_id, member_mission_key) references public.hunt_missions(version_id, mission_key) on delete cascade
);
create index if not exists hunt_rule_group_members_mission_idx on public.hunt_rule_group_members(version_id, member_mission_key);

create table if not exists public.hunt_nodes (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete cascade,
  node_id uuid references public.nodes(id) on delete restrict,
  custodian_space_id uuid references public.spaces(id) on delete set null,
  custodian_profile_id uuid references public.profiles(id) on delete set null,
  safe_descriptor text check (safe_descriptor is null or char_length(safe_descriptor) <= 280),
  created_at timestamptz not null default now(),
  unique (id, hunt_id)
);
create index if not exists hunt_nodes_hunt_idx on public.hunt_nodes(hunt_id);
create index if not exists hunt_nodes_node_idx on public.hunt_nodes(node_id) where node_id is not null;
create index if not exists hunt_nodes_custodian_space_idx on public.hunt_nodes(custodian_space_id) where custodian_space_id is not null;
create index if not exists hunt_nodes_custodian_profile_idx on public.hunt_nodes(custodian_profile_id) where custodian_profile_id is not null;

create table if not exists public.hunt_placements (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null,
  hunt_node_id uuid not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{6,80}$'),
  medium text not null check (medium in ('qr','nfc','staff','event')),
  credential_key_id text,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  health_status text not null default 'unchecked' check (health_status in ('unchecked','ok','damaged','missing')),
  foreign key (hunt_node_id, hunt_id) references public.hunt_nodes(id, hunt_id) on delete cascade,
  unique (id, hunt_id)
);
create index if not exists hunt_placements_node_idx on public.hunt_placements(hunt_node_id, hunt_id);
create index if not exists hunt_placements_hunt_idx on public.hunt_placements(hunt_id);

create table if not exists public.hunt_mission_placements (
  version_id uuid not null,
  hunt_id uuid not null,
  mission_key text not null,
  placement_id uuid not null,
  venue_space_id uuid references public.spaces(id) on delete set null,
  evidence_policy jsonb not null default '{}'::jsonb,
  primary key (version_id, mission_key, placement_id),
  foreign key (version_id, mission_key) references public.hunt_missions(version_id, mission_key) on delete cascade,
  foreign key (version_id, hunt_id) references public.hunt_versions(id, hunt_id) on delete cascade,
  foreign key (placement_id, hunt_id) references public.hunt_placements(id, hunt_id) on delete cascade
);
create index if not exists hunt_mission_placements_placement_idx on public.hunt_mission_placements(placement_id, hunt_id);
create index if not exists hunt_mission_placements_version_idx on public.hunt_mission_placements(version_id, hunt_id);
create index if not exists hunt_mission_placements_venue_idx on public.hunt_mission_placements(venue_space_id) where venue_space_id is not null;

alter table public.hunts enable row level security;
revoke all on table public.hunts from public, anon, authenticated;
grant all on public.hunts to service_role;
alter table public.hunt_versions enable row level security;
revoke all on table public.hunt_versions from public, anon, authenticated;
grant all on public.hunt_versions to service_role;
alter table public.hunt_roles enable row level security;
revoke all on table public.hunt_roles from public, anon, authenticated;
grant all on public.hunt_roles to service_role;
alter table public.hunt_partners enable row level security;
revoke all on table public.hunt_partners from public, anon, authenticated;
grant all on public.hunt_partners to service_role;
alter table public.hunt_missions enable row level security;
revoke all on table public.hunt_missions from public, anon, authenticated;
grant all on public.hunt_missions to service_role;
alter table public.hunt_rule_groups enable row level security;
revoke all on table public.hunt_rule_groups from public, anon, authenticated;
grant all on public.hunt_rule_groups to service_role;
alter table public.hunt_rule_group_members enable row level security;
revoke all on table public.hunt_rule_group_members from public, anon, authenticated;
grant all on public.hunt_rule_group_members to service_role;
alter table public.hunt_nodes enable row level security;
revoke all on table public.hunt_nodes from public, anon, authenticated;
grant all on public.hunt_nodes to service_role;
alter table public.hunt_placements enable row level security;
revoke all on table public.hunt_placements from public, anon, authenticated;
grant all on public.hunt_placements to service_role;
alter table public.hunt_mission_placements enable row level security;
revoke all on table public.hunt_mission_placements from public, anon, authenticated;
grant all on public.hunt_mission_placements to service_role;

comment on table public.hunts is 'FH-005 Frequency Hunts: one game, owned by a member or a Space, with immutable published versions. Service role only; lib/hunts writes it after its own gate.';
comment on table public.hunt_versions is 'FH-005: an edition of a Hunt graph. Published content is immutable; new material changes make a new version.';
comment on table public.hunt_missions is 'FH-005: one objective in a version. Composite FK keeps it inside its own Hunt. Answers are stored hashed.';

commit;

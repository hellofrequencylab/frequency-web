-- Phase 3 (docs/ENGAGEMENT-ARCHITECTURE.md): physical engagement triggers.
--
-- One registry for QR codes, NFC tags, and geocache "ghost nodes" + an append-only
-- log of capture attempts. Server-AUTHORITATIVE by design: clients can never read
-- node secrets or ghost-node coordinates (RLS denies all client reads), and the
-- verifier (lib/engagement/verify.ts) checks validity, signature, capture rule,
-- and PostGIS proximity before anything is granted. GPS/QR are trivially
-- spoofable, so verification lives on the server, never the device.
--
-- ADDITIVE. Requires PostGIS (migration 20240214000000). After applying,
-- regenerate types: `npx supabase gen types typescript --linked > lib/database.types.ts`.

create table if not exists public.nodes (
  id                uuid primary key default gen_random_uuid(),
  type              text not null,                          -- 'qr' | 'nfc' | 'ghost'
  label             text,
  owner_profile_id  uuid references public.profiles(id) on delete set null,
  location          geography(Point, 4326),                 -- plaque / ghost-node position
  secret            text,                                   -- server-issued signing token (signed payloads)
  reward_event_type text,                                   -- gamification event a capture emits (economy TBD)
  capture_rule      text not null default 'once_per_user',  -- once_per_user | repeatable | once_global
  proximity_m       integer,                                -- required radius (m) for geo verification
  active            boolean not null default true,
  valid_from        timestamptz,
  valid_until       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists nodes_location_gix on public.nodes using gist (location);
create index if not exists nodes_type_idx on public.nodes (type);

create table if not exists public.captures (
  id                  uuid primary key default gen_random_uuid(),
  node_id             uuid not null references public.nodes(id) on delete cascade,
  actor_profile_id    uuid not null references public.profiles(id) on delete cascade,
  location            geography(Point, 4326),               -- where the actor claimed to be (audit)
  verified            boolean not null default false,
  engagement_event_id uuid references public.engagement_events(id) on delete set null,
  captured_at         timestamptz not null default now()
);
create index if not exists captures_node_actor_idx on public.captures (node_id, actor_profile_id);
create index if not exists captures_actor_idx on public.captures (actor_profile_id, captured_at desc);

alter table public.nodes enable row level security;
alter table public.captures enable row level security;

-- nodes: NO client read policy on purpose — secrets + ghost-node coordinates are
-- sensitive (anti-cheat). All access is server-mediated via the service role.
-- captures: members read their own; writes are service-role only.
create policy "captures: read own"
  on public.captures for select
  using (
    actor_profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

-- Server-side proximity check (PostGIS). Returns true when no geo requirement is
-- set, else whether the point is within the node's radius. SECURITY DEFINER so it
-- runs regardless of the (locked-down) nodes RLS; callable by web + mobile alike.
create or replace function public.node_within_range(
  p_node_id uuid,
  p_lng double precision,
  p_lat double precision
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when n.location is null or n.proximity_m is null then true
    else st_dwithin(
      n.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      n.proximity_m
    )
  end
  from public.nodes n
  where n.id = p_node_id;
$$;

comment on table public.nodes is
  'Physical engagement triggers: QR codes, NFC tags, geocache ghost nodes. Server-mediated (RLS denies client reads) to protect secrets + ghost-node coordinates. See docs/ENGAGEMENT-ARCHITECTURE.md.';
comment on table public.captures is
  'Append-only log of node trigger attempts (verified or not). Read-own via RLS; writes service-role only.';

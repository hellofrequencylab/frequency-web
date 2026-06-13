-- Spaces: the white-label tenancy primitive (ADR-249/SPACES.md, ADR-250 step 6). One app,
-- one database, many Spaces; each is a brandable tenant with its own type, skin, domain,
-- entity (money partition), a network-connected switch, and the set of registered verticals
-- it turns on. Space-private data is tagged space_id going forward (per vertical) — this
-- migration stands up the tenancy SPINE only; it does NOT retrofit space_id onto the
-- existing single-tenant graph (all of which belongs to the seeded root space).
--
-- Applied to production via the Supabase SQL Editor (the repo's migration-history baseline
-- predates `db push` being safe here — see docs/WORKFLOW.md); the seeded root space verified
-- present. lib/database.types.ts carries the spaces types (hand-added to match this schema;
-- regenerate to refresh canonically). This file is the canonical record. Additive + idempotent.

-- ── The spaces registry ────────────────────────────────────────────────────────────────
create table if not exists public.spaces (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  name               text not null,
  -- What kind of sub-brand this is — drives default capabilities/templates/onboarding.
  -- 'root' is the canonical Frequency app itself (exactly one).
  type               text not null check (type in
                       ('root', 'practitioner', 'business', 'organization', 'lab', 'partner', 'coaching')),
  status             text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  -- The money partition for this Space's commerce (PLATFORM-VISION §1).
  entity_id          uuid not null references public.entities(id),
  -- The [data-skin] token set applied to this Space's surfaces.
  skin               text not null default 'default',
  -- Custom domain / subdomain that resolves to this Space (null = served under the root).
  domain             text unique,
  -- The switch (ADR-249 §3): when true, the Space's gamification/library/programs port into
  -- the shared Frequency network; when false it runs as a standalone white-label app.
  network_connected  boolean not null default false,
  -- Which registered verticals (lib/verticals ids: 'market', …) this Space exposes. The
  -- root space implicitly exposes all; non-root spaces select from this set.
  enabled_verticals  text[] not null default '{}',
  -- The operator who owns this Space (null for the root / platform-owned spaces).
  owner_profile_id   uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.spaces is
  'White-label tenancy: one brandable tenant per row (type/skin/domain/entity + a network switch + enabled verticals). The root space is the Frequency app itself. ADR-249/250, docs/SPACES.md.';

create index if not exists spaces_domain_idx on public.spaces (domain) where domain is not null;
create index if not exists spaces_status_idx on public.spaces (status);

-- The canonical root space — the Frequency app itself: Foundation entity, network on,
-- default skin. Existing data implicitly belongs to it.
insert into public.spaces (slug, name, type, status, entity_id, skin, network_connected, enabled_verticals)
values (
  'frequency', 'Frequency', 'root', 'active',
  'f0000000-0000-4000-a000-000000000001', 'default', true, '{}'
)
on conflict (slug) do nothing;

-- Active spaces are world-readable (a visitor hitting a Space domain resolves + sees its
-- branding); writes are service-role only (operators manage Spaces behind app-code authz,
-- like the rest of the admin surface — docs/ARCHITECTURE.md).
alter table public.spaces enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'spaces' and policyname = 'spaces_read_active') then
    create policy spaces_read_active on public.spaces for select using (status = 'active');
  end if;
end $$;

-- ── Follow-ups (deliberately NOT in this migration) ──────────────────────────────────
-- * space_id columns + per-Space RLS on NEW vertical tables as they ship (not a retrofit).
-- * space_members (who belongs to a non-root Space) once a Space has its own membership.
-- * The [data-skin] token sets + the skin resolver, and custom-domain routing (middleware).

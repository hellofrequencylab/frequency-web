-- Persisted permission map for the left-nav areas.
--
-- One row per nav area (key matches lib/nav-areas.ts). `min_role` is the lowest
-- access level that can USE the area; everyone below sees it muted in the menu.
-- This is an OVERRIDE store: an area with no row falls back to the code default
-- in lib/nav-areas.ts. Edited from /admin/roles (janitor-only) and read by the
-- app layout to drive the menu.
--
-- min_role is text (not the community_role enum) because 'visitor' — meaning
-- "everyone, even logged-out" — is a valid access level but not a community role.
create table if not exists public.area_permissions (
  area_key   text primary key,
  min_role   text not null
    check (min_role in ('visitor','member','crew','host','guide','mentor','admin','janitor')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.area_permissions enable row level security;

-- Any signed-in user may read the map (it drives their own menu). Writes go
-- exclusively through the service role in a janitor-gated server action; there
-- is intentionally no client-facing write policy.
drop policy if exists "area_permissions readable by authenticated" on public.area_permissions;
create policy "area_permissions readable by authenticated"
  on public.area_permissions for select
  to authenticated using (true);

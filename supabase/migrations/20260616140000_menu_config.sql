-- Persisted GLOBAL menu configuration for the left-nav areas — the operator's
-- single shared menu (owner: "the exact same menu everywhere, with specific
-- visibility per user role").
--
-- One row per nav area (key matches lib/nav-areas.ts). `position` sets the global
-- render order down the rail; `hidden` removes the item from EVERYONE's menu. This
-- is an OVERRIDE store: an area with no row keeps its code order (NAV_AREAS) and
-- stays visible. Per-ROLE access is a SEPARATE, existing concern — area_permissions
-- (read in lib/permissions.ts) still gates who may USE each (still-visible) item.
--
-- Edited from /admin/menu (janitor-only) and read best-effort by the app layout to
-- order + filter the rail. Mirrors area_permissions' shape: enable RLS, an
-- authenticated SELECT policy, and writes that go exclusively through the service
-- role in a janitor-gated server action (no client-facing write policy).
create table if not exists public.menu_config (
  area_key   text primary key,
  position   int,
  hidden     boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.menu_config enable row level security;

-- Any signed-in user may read the config (it drives their own menu). Writes go
-- exclusively through the service role in a janitor-gated server action; there is
-- intentionally no client-facing write policy.
drop policy if exists "menu_config readable by authenticated" on public.menu_config;
create policy "menu_config readable by authenticated"
  on public.menu_config for select
  to authenticated using (true);

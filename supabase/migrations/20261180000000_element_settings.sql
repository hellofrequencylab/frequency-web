-- Embeddable elements — the shared config layer (docs/EMBEDDABLE-ELEMENTS.md).
--
-- ONE generic settings table for every reusable in-product element (the Loom picker, QR Studio, the
-- Email editor, the Resonance CRM board, ...). A row is the PLATFORM MASTER (space_id null) or a
-- per-Space OVERRIDE (space_id set). `config` holds { settings, roles }: the element's own toggles/
-- choices, plus per-feature min-role overrides (role gating; the master ships every function, each
-- shown only for roles that meet its threshold). Resolution (defaults <- master <- space) + role
-- resolution live in lib/elements/*; this is just the store.
--
-- Reached through the service-role admin client behind app-layer authz (ADR-246), so RLS is enabled
-- with NO client policies (deny-all to anon/authenticated). Readers fail-safe to the registry
-- defaults when a row (or this table) is absent, so the app is correct before this migration applies.

create table if not exists public.element_settings (
  id uuid primary key default gen_random_uuid(),
  element_key text not null,
  space_id uuid references public.spaces(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- One PLATFORM MASTER row per element (space_id null), and one OVERRIDE row per (element, space).
create unique index if not exists element_settings_master_uidx
  on public.element_settings (element_key) where space_id is null;
create unique index if not exists element_settings_space_uidx
  on public.element_settings (element_key, space_id) where space_id is not null;

alter table public.element_settings enable row level security;
-- No client policies: all access is service-role (the admin client) behind app-layer authz.

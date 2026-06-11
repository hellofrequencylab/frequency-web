-- Per-FUNCTION (capability) permission overrides for the staff/operations axis.
-- The owner-editable companion to `area_permissions` (P1.7, ADR-222).
--
-- `area_permissions` overrides whole NAV ROUTES (one row per nav area_key). This
-- table overrides at the granularity of a (staff_role × capability domain) CELL of
-- the ADR-127 staff matrix — i.e. per FUNCTION, not per route. One row per
-- (role, domain); `access` replaces the code default in lib/core/staff-roles.ts
-- (`CAPS`) for exactly that cell.
--
-- OVERRIDE store, behavior-preserving: a (role, domain) with no row falls back to
-- the hard-coded `CAPS` matrix — so an empty table resolves EXACTLY as today. The
-- route-level grid (`area_permissions`) is untouched and stays authoritative for
-- nav visibility; this layers the capability axis on top, additively.
--
-- `role`/`domain`/`access` are text + CHECK (house style, matching
-- `stewardships` / `area_permissions`) — not PG enums — to dodge enum-evolution
-- pain and keep the vocabulary owned by the TypeScript unions (StaffRole /
-- StaffDomain / Access in lib/core/staff-roles.ts), validated in the server action.
create table if not exists public.capability_permissions (
  role       text not null
    check (role in ('owner','admin','operations','marketer','accounting','support','analyst')),
  domain     text not null
    check (domain in ('community','structure','members','roles','marketing','profiles','finance','insights','platform','qr')),
  access     text not null
    check (access in ('none','read','write')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (role, domain)
);

alter table public.capability_permissions enable row level security;

-- RLS mirrors `area_permissions` exactly: any signed-in user may READ the map (it
-- drives their own in-app affordances), but there is intentionally NO client-facing
-- write policy — writes go exclusively through the service role in a janitor-gated
-- server action (the keys-to-the-keys stay in one audited code path).
drop policy if exists "capability_permissions readable by authenticated" on public.capability_permissions;
create policy "capability_permissions readable by authenticated"
  on public.capability_permissions for select
  to authenticated using (true);

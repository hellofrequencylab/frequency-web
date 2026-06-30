-- Themes: data-driven theming (docs/THEME.md, the back-end theme manager). A theme is a
-- named set of DAWN token overrides — a light block, a dark block, and a feel block — that
-- an operator edits as DATA (no code deploy). It renders as a server-generated, scoped
-- `<style>` that overrides the code DAWN/skin tokens, selected by the existing `data-skin`
-- attribute the shell already sets. This bridges the code-skins (app/globals.css) and these
-- DB-themes with NO new client JS and correct dark-mode handling.
--
-- Applied to production via the Supabase SQL Editor (the repo's migration-history baseline
-- predates `db push` being safe here — see docs/WORKFLOW.md). lib/database.types.ts carries
-- the themes types (hand-added to match this schema; regenerate to refresh canonically). The
-- reader (lib/theme/server/themes.ts) is FAIL-SAFE: until this migration is applied it returns
-- '' and the app keeps rendering the code CSS skins. This file is the canonical record.
-- Additive + idempotent.

-- ── The themes registry ────────────────────────────────────────────────────────────────
create table if not exists public.themes (
  id           uuid primary key default gen_random_uuid(),
  -- Selected via `data-skin`; the built-in 'default'/'midnight' code skins may be mirrored
  -- here so an operator can retune them as data. Slug is validated app-side before it is
  -- ever used to build a CSS selector (lib/theme/validate.ts isSafeSlug).
  slug         text not null unique,
  name         text not null,
  -- 'skin' = a palette/feel theme bound to a data-skin value; 'occasion' = a seasonal overlay
  -- bound to a data-occasion value within an optional MM-DD calendar window.
  kind         text not null default 'skin' check (kind in ('skin', 'occasion')),
  -- The token overrides: { "light": {"--color-primary":"#.."}, "dark": {..}, "feel": {"--radius-card":".."} }.
  -- Every name/value is re-validated against the allowlist app-side before it is rendered.
  tokens       jsonb not null default '{}',
  status       text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  -- The single global default skin theme (enforced by the partial unique index below).
  is_default   boolean not null default false,
  -- Inclusive 'MM-DD' window for kind='occasion' (nullable; ignored for kind='skin').
  window_start text,
  window_end   text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.themes is
  'Data-driven theming: each row is a named set of DAWN token overrides (light/dark/feel) rendered as a scoped <style> selected by data-skin/data-occasion. Validated app-side before render. docs/THEME.md + the back-end theme manager.';

create index if not exists themes_status_idx on public.themes (status);

-- Only one global default skin theme. Partial unique so non-default rows are unconstrained.
create unique index if not exists themes_one_default_idx
  on public.themes (is_default) where is_default;

-- Active themes are world-readable (the shell resolves the active skin/occasion theme per
-- request and renders its tokens into the page <style>); draft/archived rows stay hidden.
-- Writes are service-role only — operators manage themes behind app-code authz, like spaces.
alter table public.themes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'themes' and policyname = 'themes_read_active') then
    create policy themes_read_active on public.themes for select using (status = 'active');
  end if;
end $$;

-- ── Follow-ups (deliberately NOT in this migration) ──────────────────────────────────
-- * The operator theme-manager UI (create/edit/activate themes) behind app-code authz.
-- * Optional seeding of the built-in 'default'/'midnight' skins as editable rows.

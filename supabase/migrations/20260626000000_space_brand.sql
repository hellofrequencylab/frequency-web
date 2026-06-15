-- Per-Space branding: the three brand fields an operator sets alongside a Space's theme
-- (docs/SPACES.md, ADR-249/250). The per-Space THEME assignment already exists as
-- `spaces.skin` (the [data-skin] token set chosen for the Space) — this migration only adds
-- the VISUAL brand metadata that pairs with it: a display name, a logo URL, and an accent
-- color. Live: the brand name/logo render in the Space header via BrandMark (fail-safe to the
-- default wordmark); the accent is a convenience swatch operators can reference. Additive +
-- idempotent (the spaces table ships in 20260619000000_spaces_tenancy.sql).
--
-- Applied to production via the Supabase SQL Editor (the repo's migration-history baseline
-- predates `db push` being safe here — see docs/WORKFLOW.md). lib/database.types.ts carries
-- the spaces types (hand-added to match this schema; regenerate to refresh canonically). The
-- store reader (lib/spaces/store.ts) casts the selected row locally until the generated types
-- pick these columns up, so the typed reads keep working before this is applied. This file is
-- the canonical record.

alter table public.spaces add column if not exists brand_name text;
alter table public.spaces add column if not exists brand_logo_url text;
alter table public.spaces add column if not exists brand_accent text;

comment on column public.spaces.brand_name is
  'Display brand name for this Space (falls back to spaces.name when null). Live: rendered in the Space header via BrandMark.';
comment on column public.spaces.brand_logo_url is
  'Same-origin or https URL of this Space''s brand logo. Live: rendered in the Space header via BrandMark.';
comment on column public.spaces.brand_accent is
  'Optional brand accent color (hex / rgb / hsl), validated app-side before use. The active palette still comes from the assigned theme (spaces.skin); this is a reference swatch.';

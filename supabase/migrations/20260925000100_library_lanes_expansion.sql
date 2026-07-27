-- The Loom — Pillar A "lanes" expansion (LP5/LP6). Widen `library_assets.kind` so the one
-- polymorphic catalog can manage every asset type, not just the seven it shipped with. This is
-- the DB slice of docs/LOOM-PLATFORM.md §4 (the ranked lanes) + §8 (lanes as data): the catalog
-- was built polymorphic for exactly this (ADR-478), so opening a lane is one widened check
-- constraint + a `config jsonb` convention per kind — no new columns, no data migration.
--
-- ADDITIVE + low-risk: this ONLY widens the constraint. No existing kind is dropped or renamed,
-- and no row is touched. See ADR-500 (proposed — Loom lane expansion).
--
-- New kinds (each documented below with its `config` convention):
--   'app'   — a reusable code feature/widget installed into a space (Pillar D, kind='app').
--   'font'  — a font family (file-backed + config).
--   'token' — a design-token set / skin (DAWN tokens).
--   'copy'  — a member-facing content string / snippet.
--
-- NOTE: no storage bucket is created here. The file-backed lanes (fonts / documents) get their
-- own `library-files` bucket + mime allowlist in a later slice (§4 rank 4/8). Leaving that out
-- keeps this migration a pure, reversible constraint widening.
-- TODO(later slice): add a `library-files` storage bucket for font/document payloads.

alter table public.library_assets
  drop constraint library_assets_kind_check;

alter table public.library_assets
  add constraint library_assets_kind_check
    check (kind in (
      -- existing kinds (unchanged, from 20260919000000_library_assets.sql)
      'image', 'icon', 'element', 'template', 'flow', 'theme', 'app_asset',
      -- new lanes (ADR-500, proposed)
      'app', 'font', 'token', 'copy'
    ));

-- `config jsonb` conventions for the new kinds (ADR-500, proposed; see LOOM-PLATFORM.md §8):
--   kind='app'   → { manifestKey, globalConfig, enabled }  — one row per (space, app); the root
--                  space's row is the platform default, a per-space row is that space's fork
--                  (parent_id → master). Layer-2 global config; instances live in app_instances.
--   kind='token' → { tokens, mode }                        — a DAWN design-token set / skin.
--   kind='copy'  → { body, variables, voice }              — a member-facing content string.
--   kind='font'  → file-backed (storage_*/url) + { family, weights, variable, fallbacks, license }.

comment on constraint library_assets_kind_check on public.library_assets is
  'Loom asset kinds. Original: image|icon|element|template|flow|theme|app_asset. '
  'Widened by 20260925000000 (ADR-500, proposed) with app|font|token|copy. config jsonb conventions: '
  'app={manifestKey,globalConfig,enabled}; token={tokens,mode}; copy={body,variables,voice}; '
  'font=file-backed+{family,weights,variable,fallbacks,license}. See docs/LOOM-PLATFORM.md §4/§8.';

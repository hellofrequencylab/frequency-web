-- Theme seeds: the built-in code skins/occasions as EDITABLE anchor rows in public.themes.
-- The themes registry (20260625000000_themes.sql) shipped empty, so Theme Studio had nothing
-- to list and the DB theming path was never exercised (audit BACKLOG §V). This seeds the
-- built-ins — `default` + `midnight` (lib/theme/skins.ts) and `solstice` (lib/theme/occasions.ts)
-- — as anchor rows an operator can open and retune as DATA, with NO code deploy.
--
-- Crucially these anchors carry `tokens = '{}'` (empty). An empty token set renders NOTHING,
-- so the code CSS skins (app/globals.css) remain the single source of the actual look until an
-- operator edits a row. These rows make Studio non-empty and the DB path real; they do not
-- change a single pixel on their own. Editing a row's tokens is what then overrides the code skin.
--
-- Applied to production via the Supabase SQL Editor (the repo's migration-history baseline
-- predates `db push` being safe here — see docs/WORKFLOW.md). This file is the canonical record.
-- Additive + idempotent: `on conflict (slug) do nothing` means a re-run (or a row an operator
-- has since edited) is left untouched, so this never clobbers operator changes. The partial
-- unique index `themes_one_default_idx` permits exactly one default, which only `default` claims.

insert into public.themes (slug, name, kind, status, is_default, window_start, window_end, tokens)
values
  -- The signature Dawn skin, mirrored as the single global default (one default per the
  -- partial-unique is_default index). Status 'active' so it is world-readable; empty tokens.
  ('default',  'Dawn',     'skin',     'active', true,  null,    null,    '{}'::jsonb),
  -- The Midnight skin, seeded as a draft anchor (hidden until an operator activates it).
  ('midnight', 'Midnight', 'skin',     'draft',  false, null,    null,    '{}'::jsonb),
  -- The June Solstice occasion, seeded as a draft anchor with its calendar window
  -- (matches OCCASIONS in lib/theme/occasions.ts: '06-18'..'06-22', inclusive MM-DD).
  ('solstice', 'Solstice', 'occasion', 'draft',  false, '06-18', '06-22', '{}'::jsonb)
on conflict (slug) do nothing;

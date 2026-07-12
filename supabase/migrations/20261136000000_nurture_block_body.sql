-- Nurture step block body (Email Studio Phase 5). Additive + idempotent, safe to re-run.
--
-- A nurture step's email body can now be composed in the SAME block editor an Email Studio
-- campaign uses: block_json holds an entity-blocks EntityLayout (kind 'email') as the source
-- of truth for that step's body. Null means the legacy plain-text `body` column still drives
-- the send, unchanged. The nurture runner (lib/nurture/runner.ts) renders block_json via
-- lib/email-studio (renderEmailLayout + compileEmailDoc) when present, and falls back to the
-- existing plain-body render otherwise.
--
-- nurture_steps stays SERVICE-ROLE ONLY (RLS enabled, no client policies), like the rest of
-- the nurture_* tables and campaigns.block_json — reached only through the gated admin actions
-- in app/(main)/admin/marketing/nurture and lib/nurture/*. This only ADDS a nullable column to
-- an existing, already-allowlisted table, so no new RLS policy or allowlist entry is needed.
-- lib/database.types.ts is regenerated separately (ADR-246); the seam reaches this column with
-- untyped casts until then. No em or en dashes.

alter table public.nurture_steps add column if not exists block_json jsonb;

comment on column public.nurture_steps.block_json is
  'Email Studio Phase 5: the block-editor step body (an entity-blocks EntityLayout, kind email) that is the source of truth for this step''s email when present. Null for a legacy plain-text (body) step. See lib/email-studio + lib/nurture/runner.ts.';

-- ROLLBACK:
--   alter table public.nurture_steps drop column if exists block_json;

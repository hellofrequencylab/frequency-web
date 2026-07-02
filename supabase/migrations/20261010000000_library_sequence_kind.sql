-- The Loom — open a 'sequence' lane. Widen `library_assets.kind` so a managed onboarding/wizard
-- flow can live in the one polymorphic catalog (docs/LOOM-PLATFORM.md §4 lanes, §8 lanes-as-data),
-- the DB slice of the onboarding-sequences-into-Loom plan (four-layer model). A sequence row's
-- `config jsonb` is a SequenceDef (lib/onboarding/sequence-schema.ts): { key, label, eyebrow,
-- steps[], target } — Layer 2 data whose steps bind back into the code step-registry by `type`.
--
-- ADDITIVE + low-risk: this ONLY widens the constraint (same shape as 20260925000000). No existing
-- kind is dropped or renamed, no row is touched, no new column or bucket. The live /onboarding
-- route is UNCHANGED; resolveOnboardingSequence fails safe to the code default until a published
-- sequence row exists. See ADR-500 (proposed — Loom lane expansion).

alter table public.library_assets
  drop constraint library_assets_kind_check;

alter table public.library_assets
  add constraint library_assets_kind_check
    check (kind in (
      -- existing kinds (unchanged, from 20260919000000 + 20260925000000)
      'image', 'icon', 'element', 'template', 'flow', 'theme', 'app_asset',
      'app', 'font', 'token', 'copy',
      -- new lane (ADR-500, proposed): a managed onboarding/wizard flow
      'sequence'
    ));

-- `config jsonb` convention for the new kind (see docs/LOOM-PLATFORM.md §8):
--   kind='sequence' → a SequenceDef = { key, label, eyebrow?, steps: [{ id, type, label?, content?,
--                     gate?, action? }], target?: { personas?, regionIds? } }. Steps point back into
--                     the code step-registry by `type`; the terminal step names its server action by
--                     `action` KEY. Published (approved|final) rows serve live; the code default is
--                     the fail-safe. See lib/onboarding/sequence-schema.ts + resolve-onboarding-sequence.ts.

comment on constraint library_assets_kind_check on public.library_assets is
  'Loom asset kinds. Original: image|icon|element|template|flow|theme|app_asset. '
  'Widened by 20260925000000 (ADR-500, proposed) with app|font|token|copy, and by 20261010000000 '
  'with sequence (a managed onboarding flow; config jsonb = a SequenceDef). See docs/LOOM-PLATFORM.md §4/§8.';

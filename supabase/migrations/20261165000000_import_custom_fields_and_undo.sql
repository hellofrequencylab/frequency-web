-- ============================================================================
-- CONTACT IMPORT: typed custom fields + import undo (CRM Master Build Plan
-- Phases 2-3). Additive + idempotent, SAFE to re-run. Extends the Phase-2 tables
-- from 20261159000000. lib/database.types.ts is regenerated separately; the seam
-- reaches these columns with untyped casts (ADR-246). No em or en dashes in copy.
--
-- WRITTEN-BUT-NOT-APPLIED: the lead session applies this. Nothing in the code path
-- requires it to have run first (every read is fail-safe: a missing column reads as
-- null / [] and the feature degrades, never throws).
-- ============================================================================

-- ── custom_field_registry.options: the fixed option set for a 'select' field ──
-- Most custom fields are free text and carry none; a 'select' field (chosen by hand
-- in the mapping step) stores its allowed values here for display + light validation.
alter table public.custom_field_registry
  add column if not exists options jsonb;

comment on column public.custom_field_registry.options is
  'For a value_type=''select'' field, the fixed option set (a JSON array of strings). NULL for every other type. Set when the operator declares a select field in the import mapping step.';

-- ── contact_import.created_ids: the rows a commit CREATED (for undo) ──────────
-- A member import records the network_contacts ids it created here, so "undo this
-- import" deletes exactly those rows. A Space / platform import instead tags each
-- created contacts row with meta.import_batch = the import id (no schema change
-- needed for that), and the undo deletes by that tag; created_ids stays [] for it.
alter table public.contact_import
  add column if not exists created_ids jsonb not null default '[]'::jsonb;

-- ── contact_import.rolled_back_at: when the created rows were deleted (undo) ───
alter table public.contact_import
  add column if not exists rolled_back_at timestamptz;

comment on column public.contact_import.created_ids is
  'The ids of the contact rows this import CREATED (member target: network_contacts ids). An undo deletes exactly these. A Space/platform import leaves this [] and tags created contacts rows with meta.import_batch instead.';
comment on column public.contact_import.rolled_back_at is
  'When this import was undone (its created rows deleted), or NULL. Makes the undo idempotent.';

-- ── Speed the Space/platform undo: find created rows by their import batch tag ─
-- A btree over (space_id, meta->>'import_batch') makes "delete the rows this import
-- created" a scoped index lookup instead of a table scan.
create index if not exists contacts_import_batch_idx
  on public.contacts (space_id, (meta->>'import_batch'));

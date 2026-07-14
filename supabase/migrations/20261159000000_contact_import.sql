-- ============================================================================
-- CONTACT IMPORT: the staging record for CSV contact import + data onboarding
-- (docs/CRM-MASTER-BUILD-PLAN.md Phase 2). Mirrors the business_intake staging +
-- status-machine pattern (20261022000000): ONE draft-first row per import, all
-- content in jsonb, so nothing touches a live contact list until the operator
-- reviews the preview and commits.
-- ============================================================================
--
-- TWO tables, owner/Space scoped:
--   contact_import        - one row per upload: the raw parsed rows + the column
--                           mapping + the validation results + the status machine.
--   custom_field_registry - per owner/Space known custom-field keys + inferred type,
--                           so remembered mappings and passthrough custom fields
--                           accrete across imports.
--
-- ACCESS MODEL: owner-scoped by `created_by` (the operator who started the import),
-- with the ADR-365 RLS hardening (FORCE ROW LEVEL SECURITY, policies TO authenticated,
-- WITH CHECK on writes, auth.uid() wrapped in (select ...) so it evaluates once per
-- query, every policy column indexed). The gated server code (lib/crm/import/*,
-- service-role admin client) is the real authority; RLS is the outer backstop. A row
-- can hold a member's raw uploaded list before consent is modeled, so it must never be
-- world- or cross-owner-readable.
--
-- House style (matches business_intake / network_contacts): additive + idempotent,
-- SAFE to re-run. lib/database.types.ts is regenerated separately; the seam reaches
-- these tables with untyped casts until then (ADR-246). No em or en dashes in copy.

-- ── The per-import staging row ───────────────────────────────────────────────
create table if not exists public.contact_import (
  id              uuid primary key default gen_random_uuid(),

  -- The operator/member who started this import (getMyProfileId at upload).
  created_by      uuid not null references public.profiles(id) on delete cascade,

  -- Where the imported contacts land. 'member' = the creator's personal
  -- network_contacts book. 'space' = one Space's sealed contacts(space_id). Free-text,
  -- code-gated to the known set so a new target needs no type change.
  target_kind     text not null default 'member',

  -- The Space the import targets when target_kind='space' (NULL for a member import).
  target_space_id uuid references public.spaces(id) on delete cascade,

  -- The pipeline status machine: uploaded -> mapping -> preview -> committed, with
  -- failed as a recoverable side-state. Free-text, code-gated to the known set.
  status          text not null default 'uploaded',

  -- The original filename, for the review UI ("contacts-2026.csv").
  filename        text,

  -- The parsed source: { headers: string[], rows: Record<string,string>[], rowCount }.
  -- The full file is staged here (client-side parse); the AI assist only ever sees a
  -- small sample of rows (privacy), and the commit reads from here.
  source          jsonb not null default '{}'::jsonb,

  -- ColumnMapping[]: per source header the chosen target field (or a custom-field key /
  -- 'ignore'), plus the confidence + how it was decided (synonym|fuzzy|value|ai|manual).
  mapping         jsonb not null default '[]'::jsonb,

  -- The dry-run validation + dedupe result: per-row errors + the { new, merged, skipped }
  -- diff shown in the preview. Recomputed on each preview; the source of the counts.
  validation      jsonb not null default '{}'::jsonb,

  -- The chosen merge strategy for existing matches: 'skip' | 'overwrite' | 'fill_empty'
  -- (fill_empty is the default: never clobber a value the contact already has).
  merge_strategy  text not null default 'fill_empty',

  -- The commit outcome: { created, merged, skipped, failed } once status='committed'.
  result          jsonb not null default '{}'::jsonb,

  error           text,
  committed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Hot reads: an operator lists their own imports, newest first.
create index if not exists contact_import_creator_idx
  on public.contact_import (created_by, created_at desc);
-- Space attribution / scoped lookups.
create index if not exists contact_import_space_idx
  on public.contact_import (target_space_id);
create index if not exists contact_import_status_idx
  on public.contact_import (status, created_at desc);

-- ── The custom-field registry (per owner/Space known keys + inferred type) ───
create table if not exists public.custom_field_registry (
  id           uuid primary key default gen_random_uuid(),

  -- The owner scope. Every custom field belongs to the operator who first saw it.
  owner_id     uuid not null references public.profiles(id) on delete cascade,

  -- The Space scope when the field belongs to a Space's sealed list (NULL = the owner's
  -- personal book). (owner_id, space_id, key) is unique so a re-import reuses the field.
  space_id     uuid references public.spaces(id) on delete cascade,

  -- The canonical custom-field key (a normalized header, e.g. 'lead_source').
  key          text not null,

  -- The human label as first seen ('Lead Source'), for the mapping UI.
  label        text,

  -- The inferred value type: 'text' | 'number' | 'email' | 'phone' | 'url' | 'date'.
  -- Free-text, code-gated; used to render + validate the column on later imports.
  value_type   text not null default 'text',

  -- A stable fingerprint of the source header set the field was first mapped from, so a
  -- later upload of the same shaped file can pre-fill the remembered mapping.
  fingerprint  text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists custom_field_registry_scope_key_uq
  on public.custom_field_registry (owner_id, coalesce(space_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
create index if not exists custom_field_registry_owner_idx
  on public.custom_field_registry (owner_id);
create index if not exists custom_field_registry_space_idx
  on public.custom_field_registry (space_id);
create index if not exists custom_field_registry_fingerprint_idx
  on public.custom_field_registry (fingerprint);

-- Keep updated_at fresh (the shared trigger fn already exists in this schema).
drop trigger if exists contact_import_set_updated_at on public.contact_import;
create trigger contact_import_set_updated_at
  before update on public.contact_import
  for each row execute function public.set_updated_at();
drop trigger if exists custom_field_registry_set_updated_at on public.custom_field_registry;
create trigger custom_field_registry_set_updated_at
  before update on public.custom_field_registry
  for each row execute function public.set_updated_at();

-- ── RLS (ADR-365 hardening): owner-scoped, FORCE, TO authenticated, wrapped auth ──
alter table public.contact_import        enable row level security;
alter table public.contact_import        force  row level security;
alter table public.custom_field_registry enable row level security;
alter table public.custom_field_registry force  row level security;

-- contact_import: the creator reads + writes their OWN import rows. Split per-command so
-- every write carries a WITH CHECK. auth.uid() is wrapped in (select ...) so it is an
-- initplan (evaluated once per query, not per row).
drop policy if exists contact_import_select on public.contact_import;
create policy contact_import_select on public.contact_import for select to authenticated using (
  created_by in (select id from public.profiles where auth_user_id = (select auth.uid()))
);
drop policy if exists contact_import_insert on public.contact_import;
create policy contact_import_insert on public.contact_import for insert to authenticated with check (
  created_by in (select id from public.profiles where auth_user_id = (select auth.uid()))
);
drop policy if exists contact_import_update on public.contact_import;
create policy contact_import_update on public.contact_import for update to authenticated using (
  created_by in (select id from public.profiles where auth_user_id = (select auth.uid()))
) with check (
  created_by in (select id from public.profiles where auth_user_id = (select auth.uid()))
);
drop policy if exists contact_import_delete on public.contact_import;
create policy contact_import_delete on public.contact_import for delete to authenticated using (
  created_by in (select id from public.profiles where auth_user_id = (select auth.uid()))
);

-- custom_field_registry: owner reads + writes their OWN registry entries.
drop policy if exists custom_field_registry_select on public.custom_field_registry;
create policy custom_field_registry_select on public.custom_field_registry for select to authenticated using (
  owner_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
);
drop policy if exists custom_field_registry_insert on public.custom_field_registry;
create policy custom_field_registry_insert on public.custom_field_registry for insert to authenticated with check (
  owner_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
);
drop policy if exists custom_field_registry_update on public.custom_field_registry;
create policy custom_field_registry_update on public.custom_field_registry for update to authenticated using (
  owner_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
) with check (
  owner_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
);
drop policy if exists custom_field_registry_delete on public.custom_field_registry;
create policy custom_field_registry_delete on public.custom_field_registry for delete to authenticated using (
  owner_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
);

-- ── Docs ─────────────────────────────────────────────────────────────────────
comment on table public.contact_import is
  'CSV contact-import staging (CRM Master Build Plan Phase 2). One draft-first row per upload: the parsed rows + column mapping + validation/dedupe result + status machine (uploaded -> mapping -> preview -> committed, failed as a recoverable side-state). Nothing touches a live contact list until commit. Owner-scoped by created_by, RLS forced; the gated server code in lib/crm/import/* is the authority.';
comment on column public.contact_import.source is
  'The parsed CSV: { headers, rows, rowCount }. The full file is staged here; the AI mapping assist only ever sees a small sample of rows (privacy).';
comment on column public.contact_import.merge_strategy is
  'How to resolve an existing-contact match on commit: skip | overwrite | fill_empty. fill_empty is the default (only fill blanks, never clobber an existing value).';
comment on table public.custom_field_registry is
  'Per owner/Space known custom-field keys + inferred value type (CRM Master Build Plan Phase 2). Unmapped CSV columns become custom fields here (auto-created with an inferred type) and are stored in the target contact details/meta jsonb. A header fingerprint lets a later import of the same shaped file pre-fill the remembered mapping.';

-- CRM per Space + client notes (ENTITY-SPACES-BUILD §C Phase 2, "QR studio + CRM per space").
-- This adds a space_id TENANCY axis to the existing CRM so a Space OWNER gets THEIR OWN per-space
-- pipeline, alongside the unchanged GLOBAL operator CRM at /admin/crm. It also adds client_notes,
-- a per-Space personal-data store flagged GDPR/CCPA.
--
-- BACKWARD COMPATIBILITY IS THE WHOLE POINT. The existing global CRM (lib/crm/pipeline.ts +
-- app/(main)/admin/crm/*) is host-gated and queries crm_deals/crm_activities/crm_stages/contacts
-- with NO space filter. To keep that tool seeing EXACTLY the rows it sees today, this migration:
--   1. Adds space_id NULLABLE (never NOT NULL in v1, the interim ADR-321/ADR-331 pattern), so no
--      existing INSERT breaks and the global tool keeps working unchanged.
--   2. BACKFILLS every pre-existing row to the ROOT space, so the global tool reads them as
--      root-owned and the per-space pipeline (filtering space_id = <root>) ALSO sees them. The
--      global tool reads the WHOLE table (no filter) so the backfill never changes its result set.
-- The app code makes the spaceId param OPTIONAL: absent -> exact current global behavior; present
-- -> filter to that one Space (per-space pipeline). See lib/crm/pipeline.ts + lib/crm/client-notes.ts.
--
-- ACCESS MODEL (mirrors space_bookings / space_memberships): the CRM tables stay service-role only
-- (RLS enabled, NO client policies) and are reached behind the gated server actions. client_notes is
-- PERSONAL DATA, so it is fail-closed by construction: RLS enabled with ZERO policies, every read +
-- write routed through lib/crm/client-notes.ts (gated on the Space owner via getSpaceCapabilities),
-- never exposed cross-space.
--
-- House style (matches space_membership.sql / space_booking.sql): additive + idempotent, applied to
-- production via the Supabase SQL Editor; lib/database.types.ts is regenerated separately and the CRM
-- libs reach these columns with untyped casts until then (ADR-246). SAFE to re-run.

-- ── 1. Add the space_id tenancy column to the four CRM objects (NULLABLE, interim) ──────────────
-- Nullable so no existing write path breaks; ON DELETE CASCADE so removing a Space removes its CRM
-- rows. We deliberately do NOT set NOT NULL in v1 (the interim expand step, ADR-321/ADR-331): the
-- global tool inserts without space_id today, and the backfill below stamps the root space onto
-- every existing row so both tools agree.
alter table public.crm_deals      add column if not exists space_id uuid references public.spaces(id) on delete cascade;
alter table public.crm_activities add column if not exists space_id uuid references public.spaces(id) on delete cascade;
alter table public.crm_stages     add column if not exists space_id uuid references public.spaces(id) on delete cascade;
alter table public.contacts       add column if not exists space_id uuid references public.spaces(id) on delete cascade;

comment on column public.crm_deals.space_id is
  'Tenancy scope (ENTITY-SPACES-BUILD Phase 2). NULLABLE interim (ADR-321/ADR-331). Backfilled to the root space so the GLOBAL /admin/crm tool (which queries with no space filter) is unchanged; a per-space pipeline filters space_id to one Space. Never NOT NULL in v1.';
comment on column public.crm_activities.space_id is
  'Tenancy scope (ENTITY-SPACES-BUILD Phase 2). NULLABLE interim. Backfilled to the root space. Filtered per Space by the per-space pipeline; the global tool ignores it.';
comment on column public.crm_stages.space_id is
  'Tenancy scope (ENTITY-SPACES-BUILD Phase 2). NULLABLE interim. The shared seed stages are root-owned after backfill; a Space may add its own stages later (none in v1).';
comment on column public.contacts.space_id is
  'Tenancy scope (ENTITY-SPACES-BUILD Phase 2). NULLABLE interim. Backfilled to the root space. The global Studio CRM reads contacts unscoped; a per-space contact list filters to one Space.';

-- ── 2. Backfill every existing row to the ROOT space ────────────────────────────────────────────
-- The root space (spaces.type='root') owns all pre-existing data and behaves exactly as today
-- (ENTITY-SPACES-SYSTEM §4.12). Only rows with a NULL space_id are stamped, so this is idempotent
-- and safe to re-run. If there is no root space (a fresh DB), the update touches nothing.
update public.crm_deals
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;
update public.crm_activities
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;
update public.crm_stages
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;
update public.contacts
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;

-- ── 3. Leading-column (space_id, ...) indexes for the per-space reads ────────────────────────────
-- Every per-space read filters space_id FIRST, so space_id leads each composite. The global tool's
-- existing single-column indexes (crm_deals_stage_idx, etc.) are untouched and still serve it.
create index if not exists crm_deals_space_stage_idx      on public.crm_deals      (space_id, stage_id);
create index if not exists crm_deals_space_updated_idx     on public.crm_deals      (space_id, updated_at desc);
create index if not exists crm_activities_space_deal_idx   on public.crm_activities (space_id, deal_id);
create index if not exists crm_stages_space_sort_idx       on public.crm_stages     (space_id, sort_order);
create index if not exists contacts_space_created_idx      on public.contacts       (space_id, created_at desc);

-- ── 4. client_notes: per-Space PERSONAL DATA on a contact (GDPR/CCPA flagged) ────────────────────
-- An owner's private note about one of their contacts, scoped to the Space. This is PERSONAL DATA
-- (a third party's information held by the Space), so it is fail-closed by construction: RLS is
-- enabled with NO policies at all, and EVERY read + write goes through lib/crm/client-notes.ts,
-- gated on the Space owner (getSpaceCapabilities canEditProfile). A note is never exposed
-- cross-space: the owner reads only their own Space's notes for a contact in that Space.
create table if not exists public.client_notes (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  contact_id         uuid references public.contacts(id) on delete cascade,
  author_profile_id  uuid references public.profiles(id) on delete set null,
  body               text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.client_notes is
  'GDPR/CCPA PERSONAL DATA: a Space owner''s private notes about a contact (ENTITY-SPACES-BUILD Phase 2). space_id-scoped and fail-closed: RLS is ENABLED with NO policies, so the ONLY access path is the gated server actions in lib/crm/client-notes.ts (service-role admin client), authored by and readable only to the Space owner (canEditProfile). Never exposed cross-space. A data-subject erasure deletes the rows here for the contact.';
comment on column public.client_notes.space_id is 'The Space that owns this note. Every read/write filters space_id, so a note is never visible to another Space.';
comment on column public.client_notes.contact_id is 'The contact (CRM person) the note is about. ON DELETE CASCADE so erasing a contact erases their notes.';
comment on column public.client_notes.author_profile_id is 'The profile that wrote the note (the owner/editor). ON DELETE SET NULL so a removed author does not delete the note.';
comment on column public.client_notes.body is 'The note text (personal data). Plain text, validated + length-capped on write by addClientNote.';

-- Tenant filter + the per-contact thread scan. space_id leads; (space_id, contact_id, created_at)
-- serves "this Space's notes on this contact, newest first".
create index if not exists client_notes_space_contact_idx on public.client_notes (space_id, contact_id, created_at desc);

-- ── 5. RLS: enabled, NO client policies (all access via the service-role admin client) ──────────
-- Exactly like space_bookings / space_memberships: enabling RLS with no SELECT/INSERT/UPDATE/DELETE
-- policy denies ALL direct client access, so the only path is the gated server actions. For
-- client_notes this is the PERSONAL-DATA fail-closed guarantee: zero policies means zero ambient
-- read, ever, even for an authenticated session. (The CRM tables were already RLS-enabled with no
-- policies in 20260605060000_crm_pipeline.sql and 20240221000000_studio_crm.sql; this re-asserts it
-- idempotently, harmless if already on.)
alter table public.crm_deals      enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_stages     enable row level security;
alter table public.contacts       enable row level security;
alter table public.client_notes   enable row level security;

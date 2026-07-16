-- CONTACT RELATIONSHIPS — the stored half of the Resonance CRM relationship model (ADR-625,
-- docs/DECISIONS.md). A contact holds a SET of relationships to the community, split in two:
--
--   • DERIVED   (member / subscriber / lead / business) are COMPUTED from the record on read
--               (lib/crm/classification.ts) and never stored here.
--   • ASSIGNABLE (donor / partner / vendor / labs_member / volunteer) are operator-conferred and
--               STORED as rows in this table, one active row per (contact, kind).
--
-- WHY `kind` IS FREE TEXT, NOT A PG ENUM: the whole point of this seam is that adding a new
-- assignable kind stays MIGRATION-FREE — one row in the RELATIONSHIP_KINDS registry
-- (lib/crm/relationships.ts) and the app validates writes/reads against it. A Postgres enum would
-- force a migration (and an `ALTER TYPE ... ADD VALUE` cannot run in a transaction) for every new
-- kind. So `kind` is text, validated in CODE (isAssignableKind); unknown kinds are ignored on read
-- and rejected on write.
--
-- TENANCY / SECURITY POSTURE: mirrors the ORIGINAL public.contacts posture (20240221000000_studio_
-- crm.sql) — RLS ENABLED with NO client policy, so the table is SERVICE-ROLE ONLY. Every read/write
-- goes through the service-role admin client behind a staff gate (lib/crm/relationships.ts); no
-- anon/authenticated client can reach a row. `space_id` is a nullable tenancy tag (null = platform /
-- root scope) that a future per-Space policy can gate on without a schema change.
--
-- House style: additive + idempotent (SAFE to re-run), applied to production via the Supabase SQL
-- Editor; this file is the canonical record. Reached UNTYPED until lib/database.types.ts regenerates
-- (ADR-246); the reader casts. No em or en dashes.

-- ── The table ────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.contact_relationships (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  space_id    uuid references public.spaces(id),
  -- Free text, validated in code against the RELATIONSHIP_KINDS registry (NOT a PG enum, by design).
  kind        text not null,
  status      text not null default 'active',   -- active | ended
  since       date,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- "Every relationship for this contact" (the per-contact + batched .in(contact_id) reads).
create index if not exists contact_relationships_contact_idx
  on public.contact_relationships (contact_id);
-- "Active <kind> in this Space" (the segmentation / roster filter path).
create index if not exists contact_relationships_space_kind_status_idx
  on public.contact_relationships (space_id, kind, status);

-- ── RLS: service-role only, NO client policy (mirror the contacts posture) ────────────────────────
alter table public.contact_relationships enable row level security;
-- No policies: reads/writes are service-role behind a staff gate (lib/crm/relationships.ts), exactly
-- like public.contacts / public.team_members in 20240221000000_studio_crm.sql.

comment on table public.contact_relationships is
  'Stored ASSIGNABLE relationship kinds for a CRM contact (donor/partner/vendor/labs_member/volunteer), one active row per (contact, kind). DERIVED kinds (member/subscriber/lead/business) are computed in code and never stored. `kind` is free text validated against the RELATIONSHIP_KINDS registry (lib/crm/relationships.ts) so new kinds need no migration. Service-role only (RLS enabled, no client policy) like public.contacts. space_id is a nullable tenancy tag (null = root/platform). ADR-625.';

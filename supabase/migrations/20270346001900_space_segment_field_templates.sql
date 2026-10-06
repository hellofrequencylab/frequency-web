-- Per-segment custom contact fields: a Space segment carries a field template (LIVE-662).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- Owner ruling 2026-09-29 "Custom fields only" (custom objects ruled out). A Space's custom fields
-- already exist as data: the registry (custom_field_registry, 20261159000000) names and types each
-- key, and a contact's values live in contacts.meta.custom. What was missing is the TEMPLATE: which
-- fields a segment's contacts should carry. This column holds it as the registry keys, in display
-- order. A contact that matches the segment shows those fields on its detail card and can have them
-- filled in there (lib/crm/segment-fields.ts); CSV import already maps columns to the same keys.
--
-- The keys are plain text, not a foreign key: the registry's unique key is (owner, space, key) and a
-- template only ever names keys of its own Space, which the app checks on write. An unknown key is
-- ignored on read, so a removed field never breaks a card.
--
-- space_segments is service-role only (no client policies), so no RLS or grant changes.
--
-- Additive and idempotent. ROLLBACK: alter table public.space_segments drop column field_keys;

alter table public.space_segments
  add column if not exists field_keys text[] not null default '{}'::text[];

alter table public.space_segments
  drop constraint if exists space_segments_field_keys_max;
alter table public.space_segments
  add constraint space_segments_field_keys_max check (cardinality(field_keys) <= 20);

comment on column public.space_segments.field_keys is
  'The custom contact fields (custom_field_registry keys, in order) a contact in this segment carries (LIVE-662, lib/crm/segment-fields.ts). Max 20.';

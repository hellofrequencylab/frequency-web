-- FINAL SWEEP · 2026-07-28 — two owner-directed data operations (ADR-892).
-- STATUS: APPLIED to production 2026-07-28 via MCP execute_sql. Kept as the record;
-- every statement is guarded so a re-run matches nothing.

-- ── 1. THE FOUNDING CHANNELS CARRY THEIR DOOR'S NAME (ADR-892) ─────────────────
-- Five founding Channels predated the ADR-887 subject vocabulary and still wore
-- their old names next to new category chips. A Channel that IS a subject door
-- carries the door's label verbatim (lib/taxonomy/subjects.ts). Slugs are
-- permalinks and DO NOT move. Guarded by slug + current name: idempotent.
-- Channels that are communities, not doors (Meld Community Cowork), keep their names.

-- VERIFY BEFORE: select slug, name, category from public.topical_channels order by display_order;

update public.topical_channels set name = 'Friendship / Relationships' where slug = 'human-relating'          and name = 'Human Relating';
update public.topical_channels set name = 'Mental Health / Recovery'   where slug = 'mental-emotional-health' and name = 'Mental / Emotional Health';
update public.topical_channels set name = 'Movement / Fitness'         where slug = 'movement'                and name = 'Movement';
update public.topical_channels set name = 'Service / Activism'         where slug = 'activism'                and name = 'Activism';
update public.topical_channels set name = 'Creative / Arts'            where slug = 'creative'                and name = 'Creative';

-- VERIFY AFTER (confirmed 2026-07-28): every subject-door Channel's name equals
-- its subject's label; Meld Community Cowork and Business Support untouched.

-- ── 2. DELETE THE templeofaset-archived DUPLICATE SPACE ────────────────────────
-- Owner directive ("Keep this Royal Temple space and delete the other" +
-- "Make all the final changes"). The row was the abandoned FIRST attempt at the
-- live `templeofaset` Space, created 26 minutes before it and archived since.
-- Pre-verified before applying: status='archived', 0 scoped events, 0 associated
-- events, 0 circles, 1 member row (the creator). The delete is the same operation
-- the product's own deleteSpace performs: one `spaces` row, ON DELETE CASCADE
-- fans out to members/pages/CRM. Guarded by id + slug + status + non-root.

delete from public.spaces
 where id = 'dc06287f-05f9-4987-9143-410c45875b03'
   and slug = 'templeofaset-archived'
   and status = 'archived'
   and type <> 'root';

-- VERIFY AFTER (confirmed 2026-07-28): only the live `templeofaset` ("Temple of
-- Aset", active) and `royaltemple` ("Royal Temple", active) remain.

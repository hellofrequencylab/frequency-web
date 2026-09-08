-- page_content gets the one column the copy cascade was written for and never had (PROG-P6, ADR-1284).
--
-- THE GAP. `page_content` (20260609040000, ADR-180) holds a page's title and description, and
-- 20260612050000 added the hero image and the CTA pair. Every one of those is HEADER chrome: a
-- line under the h1, a picture behind it, a button beside it. The copy cascade
-- (lib/layout/content-cascade.ts, ADR-1122) made those fields inherit down the route tree, and
-- the row it advances, PROG-P6, has said since 2026-08-20 that the editable fields should widen
-- to "body copy and images". Images were already here: `hero_image` is the image slot, it
-- cascades, and the cascade doc names no second one. Body copy had no column at all, so an
-- operator who wanted a paragraph of intro under a section's header had nowhere to put it.
--
-- THE FIX. One nullable text column, `body`: the intro copy that renders under the page header,
-- above the toolbar and the list, on every surface that already renders the row's hero. Plain
-- text, paragraphs split on a blank line; NOT jsonb, because the operator editor is a textarea
-- and the reader is a paragraph renderer, and a document model here would be a second page
-- editor beside the real one (docs/EDITOR-ARCHITECTURE.md). NULL, and a blank string, both mean
-- "this rung says nothing" and the cascade walks on.
--
-- THE CASCADE RULE. `body` INHERITS, like `hero_image` and unlike `title` / `description`: it is
-- the section's voice, not the page's identity, and it never feeds `<title>` or a meta
-- description, so inheriting it manufactures no duplicate metadata. A page row that sets its own
-- `body` still wins over its section's, and both win over the reserved site row `'*'`.
--
-- No RLS or grant changes: the table stays public-read, and the only writer of this column is the
-- service role behind the admin-gated save action (lib/page-content-actions.ts).

alter table public.page_content
  add column if not exists body text;

comment on column public.page_content.body is
  'Optional intro copy rendered under the page header, above the toolbar and list (PROG-P6, ADR-1284). Plain text, paragraphs split on a blank line. INHERITS down the route tree through the copy cascade (page row, then each ancestor section row, then the site row ''*''); NULL or blank = this rung says nothing.';

-- Re-key `pages` to (space_id, slug) — CONTRACT step for the Puck micro-site store.
-- Closes the ⚠️ recorded in docs/DECISIONS.md ADR-927.
--
-- THE BUG. `pages.slug` has been globally UNIQUE since the table was created
-- (20240226000000_pages_cms.sql: `slug text not null unique` → constraint `pages_slug_key`),
-- and the expand step that space-scoped the table (20260710000000_pages_space_id.sql) added
-- `space_id` plus a NON-unique index `pages_space_slug_idx (space_id, slug)` but never touched
-- the global key. Meanwhile every reader and writer in the app treats a page as (space_id, slug):
--   • lib/page-editor/data.ts — getPage/listPages both .eq('space_id', …).eq('slug', …)
--   • app/(main)/edit/actions.ts — unpublishPage scopes its update by both columns
-- So the storage contract and the application contract disagree. Today nothing breaks, because
-- the Puck editor is still gated to the `isEditableSlug` allowlist on a single (root) Space. The
-- moment per-Space authoring un-gates (Phase 5 white-label), two Spaces cannot both own a page
-- called `about`: the second Space's publish either raises 23505, or — worse — the upsert's
-- `onConflict: 'slug'` resolves against the OTHER Space's row and overwrites its published
-- document. That is silent cross-tenant data loss, which is why this lands before the un-gate
-- rather than with it.
--
-- ── PRE-FLIGHT CHECK — RUN THIS FIRST, EXPECT ZERO ROWS ──────────────────────────────────
-- Any row this returns would violate the new key. Do NOT run the migration until it is empty.
-- Resolve duplicates by hand (decide which document survives); this file deliberately contains
-- no dedupe, so it can never destroy a page nobody chose to discard.
--
--   select space_id,
--          slug,
--          count(*) as n,
--          array_agg(id::text order by updated_at desc nulls last) as ids
--   from public.pages
--   group by space_id, slug
--   having count(*) > 1;
--
-- Companion count — rows still missing a tenant (space_id stays NULLABLE, see §2):
--
--   select count(*) from public.pages where space_id is null;
--
-- Checked against production (project azsqfeonabsbmemvddqd) on 2026-08-04: 5 rows, all in the
-- root Space, 5 distinct slugs, 0 NULL space_id, 0 duplicate (space_id, slug) pairs. Other
-- environments (local dev, preview branches, the `hook` project) were NOT inspected, so the
-- pre-flight is not optional there.
--
-- SAFETY. `add constraint … unique` VALIDATES against existing data and ABORTS the transaction on
-- a violation. That abort IS the safety property: a duplicate stops the migration instead of being
-- silently merged away. Ordering below adds the new key BEFORE dropping the old one, so there is
-- no window in which slugs are unprotected, and the stricter global key guarantees the new
-- composite can be added without conflict. No FK references pages(slug) (verified against
-- production), so dropping `pages_slug_key` breaks no referential dependency.
--
-- NOT ADDITIVE — NOT APPLIED TO PRODUCTION BY THE AUTHOR. This migration DROPS a constraint, which
-- puts it outside the repo's "additive + idempotent, apply by hand via the SQL Editor" house rule
-- (docs/WORKFLOW.md). It is authored here as the canonical record and must be applied deliberately,
-- after the pre-flight above, by whoever owns the un-gate. Re-running it is a no-op.

-- ── 1. Add the composite unique FIRST (validates existing data; aborts on a duplicate) ────
-- NULLS NOT DISTINCT (Postgres 15+; Supabase runs 17) is load-bearing here. `space_id` is still
-- NULLABLE — the expand step never took a contract step — and under the default NULLS DISTINCT
-- rule two rows with space_id IS NULL and slug 'about' would BOTH be accepted, quietly reopening
-- the very hole this migration closes for any row that has not been backfilled. Treating NULL as
-- a single tenant keeps the key honest until space_id is made NOT NULL.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pages'::regclass and contype = 'u'
      and conname = 'pages_space_id_slug_key'
  ) then
    alter table public.pages
      add constraint pages_space_id_slug_key unique nulls not distinct (space_id, slug);
  end if;
end $$;

comment on constraint pages_space_id_slug_key on public.pages is
  'A page is identified by (space_id, slug), matching how every reader and writer queries the table. Backing key for the app''s onConflict ''space_id,slug'' upsert in app/(main)/edit/actions.ts. NULLS NOT DISTINCT because space_id is still nullable (ADR-927).';

-- ── 2. Drop the global unique on slug ─────────────────────────────────────────────────────
-- The single-tenant assumption from 20240226000000_pages_cms.sql. Two Spaces may now each own a
-- page called 'about'. Dropping the constraint drops its backing index (pages_slug_key).
do $$ begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pages'::regclass and contype = 'u'
      and conname = 'pages_slug_key'
  ) then
    alter table public.pages drop constraint pages_slug_key;
  end if;
end $$;

-- ── 3. Drop the now-redundant plain index ────────────────────────────────────────────────
-- The new unique constraint creates a unique btree on exactly (space_id, slug), which serves every
-- lookup `pages_space_slug_idx` served. Keeping both would mean two identical indexes maintained on
-- every write. Same cleanup the page_settings contract step made (20260709000000).
drop index if exists public.pages_space_slug_idx;

comment on column public.pages.space_id is
  'The Space this Puck micro-site page belongs to. Part of the (space_id, slug) unique key as of ADR-927. Still NULLABLE (no NOT NULL contract step yet); the unique key is NULLS NOT DISTINCT so untenanted rows cannot duplicate a slug. on delete cascade: a Space''s pages die with the Space.';

-- pages.space_id becomes NOT NULL, and the column comment stops saying the opposite.
--
-- LIVE-112. This sat behind a stated blocker — "needs the untenanted-rows ruling" — and the
-- blocker has NO SUBJECT: `public.pages` holds 4 rows and 0 of them carry a null space_id.
-- That is the ADR-1082 pattern in its purest form: a blocker phrased as a pending decision,
-- where the thing to be decided does not exist. Re-counted immediately before writing this
-- migration, which is what the row asked for, because a count taken a week ago is a guess.
--
-- ── WHY IT IS SAFE BY CONSTRUCTION, NOT ONLY BY COUNT ──────────────────────────────────────
-- Every read and write goes through lib/page-editor/data.ts, which defaults spaceId to
-- loadRootSpaceId(). So the application cannot produce an untenanted row even if it wanted to;
-- the nullability was a leftover from before ADR-927 gave the table its (space_id, slug) key.
-- `space_id` already carries `on delete cascade`, so the constraint adds no new delete
-- behaviour — a Space's pages already died with the Space.
--
-- ── 🔴 WHY THIS SHIPS ALONE ────────────────────────────────────────────────────────────────
-- Merging deploys to production (AGENTS.md). A NOT NULL that meets an unexpected row fails the
-- migration AND the deploy carrying it. Inside a sweep that is somebody else's work rolled back
-- too; alone it is one revert. This migration deliberately contains nothing else.
--
-- Reversible: `alter table public.pages alter column space_id drop not null;`
-- ADR-1160.

begin;

-- CONTROL, BEFORE. The NOT NULL below is self-guarding — it fails on a null all by itself — so
-- this arm is not there to prevent damage. It is there to make the failure LEGIBLE: a bare
-- "column contains null values" names neither the count nor the table's size, and the next
-- reader of a failed production deploy should not have to go and query for both.
do $$
declare
  v_total      integer;
  v_untenanted integer;
begin
  select count(*), count(*) filter (where space_id is null)
    into v_total, v_untenanted
    from public.pages;
  if v_untenanted > 0 then
    raise exception
      'pages.space_id cannot take NOT NULL: % of % row(s) are untenanted. LIVE-112 measured 0 of 4 on 2026-08-25; something created an untenanted page since. Tenant them (lib/page-editor/data.ts defaults to loadRootSpaceId()) before re-running.',
      v_untenanted, v_total;
  end if;
  raise notice 'pages: % row(s), 0 untenanted — proceeding.', v_total;
end $$;

alter table public.pages alter column space_id set not null;

-- The comment currently asserts the opposite of what is now true, which is worse than no
-- comment: it is documentation that will be believed.
comment on column public.pages.space_id is
  'The Space this Puck micro-site page belongs to. Part of the (space_id, slug) unique key as of ADR-927. NOT NULL as of LIVE-112 / ADR-1160 — every page is tenanted, and lib/page-editor/data.ts defaults spaceId to loadRootSpaceId() on every write, so the application cannot produce an untenanted row. The unique key keeps its NULLS NOT DISTINCT clause, which is now inert rather than wrong. on delete cascade: a Space''s pages die with the Space.';

-- CONTROL, AFTER. A positive assertion that the constraint is actually recorded, because the
-- statement above succeeding is not the same as the catalog carrying it (a no-op ALTER on an
-- already-NOT-NULL column also succeeds, and would leave this migration reading as if it did
-- work it did not do).
do $$
begin
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'pages' and column_name = 'space_id') <> 'NO' then
    raise exception 'pages.space_id is still nullable after the ALTER — the constraint did not land';
  end if;
end $$;

commit;

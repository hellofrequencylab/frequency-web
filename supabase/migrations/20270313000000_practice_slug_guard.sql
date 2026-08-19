-- A practice row can no longer land with a NULL slug.
--
-- WHAT WAS WRONG. `20260627010000_practice_slugs.sql` added `practices.slug`, backfilled every
-- row that existed, and created a PARTIAL unique index (`where slug is not null`). Two days later
-- `20260629000000_seed_season_1_stretch.sql` inserted more practices through
-- `pg_temp.upsert_practice(...)`, which never sets a slug. The backfill had already run, NULLs do
-- not collide under a partial index, and nothing complained. `forkPractice()` in lib/practices.ts
-- has the same omission, so the hole is not historical.
--
-- Measured in production 2026-08-19: 20 approved public practices, 18 with a slug.
--
-- WHY IT MATTERED. `app/sitemap.ts` advertises `/discover/practices/${p.slug ?? p.id}`. That
-- fallback is deliberate (a slugless practice must stay reachable) but it is SILENT, so those rows
-- shipped raw uuids to crawlers while every other practice shipped a keyword slug. A fail-safe
-- with no gate watching it is an invisible regression (AGENTS.md).
--
-- THIS MIGRATION DOES NOT BACKFILL THE TWO LIVE ROWS, AND THAT IS DELIBERATE. Both turned out to
-- be exact-title DUPLICATES of an older seeded practice that already holds the clean slug:
--   Nature Witnessing  ec0161ea (2026-06-17, slug, 18 logs)  vs  1516f5c4 (06-18, no slug, 0 logs)
--   One Small Reach    b5b1009a (2026-06-17, slug, 12 logs)  vs  ef2b62fb (06-21, no slug, 0 logs)
-- Minting slugs for the newer pair would cement two duplicate entries in the public library under
-- permanent id-suffixed URLs. Retiring a duplicate is what `merge_practices(from_id, to_id)`
-- (20260828000000) is for, and which of two public practices survives is a library-curation call,
-- not a schema change. It is tracked as its own backlog row.
--
-- WHY THE NET APPENDS AN ID FRAGMENT INSTEAD OF PROBING FOR A FREE SLUG. A uniqueness probe would
-- read `public.practices` through the caller's RLS. A member who cannot see the row holding
-- `nature-witnessing` would be told the name is free, and `practices_slug_key` would then reject
-- the INSERT, turning a cosmetic omission into a failed practice creation. Making the function
-- SECURITY DEFINER to see past RLS would put a new definer function on the REST surface, which
-- 20261231000000 exists to prevent. So the net does not probe: it appends 12 hex of the row's own
-- id, unique by construction. No query, no RLS dependency, no collision, cannot fail an insert.
--
-- The clean short slug stays the job of `uniquePracticeSlug()` in lib/practices.ts on the happy
-- path. This fires only where that was skipped, and the id-suffixed shape is self-identifying, so
-- a slug in that shape is a visible signal that a write path forgot.
--
-- APPLIED to production 2026-08-19 through the Supabase MCP, which stamps the ledger with the
-- APPLY-TIME wall clock and ignores the version in a filename. It landed as `20260819141841`,
-- the orphan-pair signature scripts/maintenance/ledger-parity.mjs exists to name. Repaired with
-- the one statement that module prescribes, run knowingly against production:
--
--   update supabase_migrations.schema_migrations
--      set version = '20270313000000'
--    where version = '20260819141841';
--
-- The FILENAME version is the one the repo sorts and replays by, so it keeps its place in the
-- sequence and the ledger was moved to match, never the other way round.
--
-- ⚠️ AND THE ORDER OF OPERATIONS IS THE LESSON. Applying before the file was on `main` made
-- `check:migrations` fail on EVERY open pull request, not just this one, because the gate compares
-- the whole tree against the whole ledger. Apply and land in the same change.
--
-- REVERSIBLE: drop trigger practices_fill_slug on public.practices;
--             drop function public.practices_fill_slug();

create or replace function public.practices_fill_slug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_base text;
begin
  if new.slug is not null then
    return new;
  end if;
  v_base := nullif(
    trim(both '-' from regexp_replace(lower(trim(coalesce(new.title, ''))), '[^a-z0-9]+', '-', 'g')),
    ''
  );
  new.slug := coalesce(left(v_base, 47) || '-', 'practice-')
              || substr(replace(new.id::text, '-', ''), 1, 12);
  return new;
end $$;

comment on function public.practices_fill_slug() is
  'Safety net: a practice row can never land with a NULL slug. Appends 12 hex of the row id so the result is unique without reading the table (RLS would make a probe unreliable and a collision would fail the insert). The clean short slug is minted by uniquePracticeSlug() in lib/practices.ts on the normal create path.';

-- SECURITY INVOKER, so it is outside the definer-only sweep in 20261231000000. Revoke explicitly
-- rather than rely on that: a trigger function is never meant to be a REST endpoint, and Postgres
-- grants EXECUTE to PUBLIC by default, so PUBLIC has to be named first or the revoke is a no-op.
revoke execute on function public.practices_fill_slug() from public, anon, authenticated;

drop trigger if exists practices_fill_slug on public.practices;
create trigger practices_fill_slug
  before insert or update on public.practices
  for each row execute function public.practices_fill_slug();

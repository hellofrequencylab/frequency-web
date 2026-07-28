-- ADR-897 · prune per-occurrence event embeddings
-- ============================================================================
-- A script, deliberately NOT a migration. It deletes rows from a derived cache, it is safe to run
-- late or never, and it must be run by a human who reads step 1's output before running step 2.
-- Same shape as scripts/adr-884-backfill-recurrence-drift.sql.
--
-- WHY THERE IS ANYTHING TO PRUNE
--   Recurrence is materialised (ADR-007): a weekly series is ~9 `events` rows inside the 60-day
--   horizon, a daily one ~61. `buildEventText` (lib/events/embeddings.ts) composes the embedding
--   source from title + description + category + energy_tag and NO DATE, so every occurrence of a
--   series produced a byte-identical 384-d vector. The index has been carrying up to 61 identical
--   copies of one series' vector, and paying to re-embed each of them.
--
-- 🔴 RUN ORDER, AND WHY IT IS NOT NEGOTIABLE
--   1. E1 — lib/events/matching.ts looks a vector up by the row's own id AND its seriesKey, own id
--      winning, then fans back out. 2. E2 — backfillEventEmbeddings collapses its candidates by
--      seriesKey and writes ONE row on the anchor id. E1 and E2 ship in the SAME change set, so
--      the reader is never narrower than the writer for a single deploy.
--   3. E3 — this script, run by hand after E2 has had one full cron day.
--   Running this BEFORE that deploy is live drops every occurrence's interest score to zero with no
--   error and no log entry: the score simply loses its 45% interest term and the "For You" ranking
--   silently degrades to social + context. Confirm the deploy carrying E1 is live first.
--
--   Note E2 does NOT filter the candidate read to anchor rows. An anchor whose own starts_at has
--   passed can never re-enter an upcoming-only read, so a long-running series that lacked a vector
--   could never acquire one. It reads the live occurrences and collapses them instead, which is
--   exact: the materialiser copies title, description, category and energy_tag verbatim.
--
-- HOW TO RUN IT SAFELY
--   Step 1 alone, in the Supabase SQL editor. Read the numbers. If `occurrence_embedding_rows` is 0
--   there is nothing to do. If `series_missing_anchor_vector` is anything but 0, STOP: those series
--   would lose their only vector. Re-run the embed cron and check again before continuing.
--   Only then run step 2, inside the transaction as written.

-- ── Step 1: look, do not touch ──────────────────────────────────────────────
-- a) How many embedding rows belong to an occurrence (a row carrying parent_event_id).
select count(*) as occurrence_embedding_rows
from   event_embeddings ee
join   events e on e.id = ee.event_id
where  e.parent_event_id is not null;

-- b) The safety check. Series that have occurrence vectors but NO vector on their anchor: deleting
--    their occurrence rows would leave them with nothing to match on. Expect 0.
select count(distinct e.parent_event_id) as series_missing_anchor_vector
from   events e
join   event_embeddings ee on ee.event_id = e.id
where  e.parent_event_id is not null
  and  not exists (
         select 1 from event_embeddings a where a.event_id = e.parent_event_id
       );

-- c) The shape of the win, largest series first.
select e.parent_event_id,
       count(*) as duplicate_vectors
from   events e
join   event_embeddings ee on ee.event_id = e.id
where  e.parent_event_id is not null
group  by e.parent_event_id
order  by duplicate_vectors desc
limit  20;

-- ── Step 2: the prune. Run ONLY after reading step 1's output. ──────────────
-- The `exists` clause is the guard, restated in SQL rather than trusted from step 1(b): a series
-- whose anchor has no vector keeps its occurrence vectors, so no series can be left unmatchable.
begin;

delete from event_embeddings ee
using  events e
where  e.id = ee.event_id
  and  e.parent_event_id is not null
  and  exists (
         select 1 from event_embeddings a where a.event_id = e.parent_event_id
       );

-- Sanity check before you commit: this should now be 0 except for the anchor-less series step 1(b)
-- flagged. If it is a large number, ROLLBACK and re-read.
select count(*) as remaining_occurrence_rows
from   event_embeddings ee
join   events e on e.id = ee.event_id
where  e.parent_event_id is not null;

commit;
-- rollback;  -- swap for the commit above if the count above surprises you.

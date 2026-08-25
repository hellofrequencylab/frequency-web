-- ⚠️ NOT APPLIED. Authored for the OWNER to apply. Applying is TWO steps — see
-- supabase/migrations/README.md (ADR-963): apply it, then repair the ledger so the row carries
-- THIS version (20270323000000), not the timestamp `apply_migration` mints. Model: 20270305000000
-- (the LIVE-028 block rewrite), which shipped the same way.
--
-- 🔴 WHILE IT SITS HERE UNAPPLIED, `check:migrations` IS RED IN CI, AND THAT IS THE EXPECTED STATE
-- RATHER THAN A FAILURE TO CHASE. CI arms the ledger half with real credentials (ci.yml, "Contract
-- guards"), so it compares this directory against production's live ledger and reports the file as
-- `unpairedRepo` — "authored but NEVER APPLIED (repo file, no ledger row)" — which sets
-- `inParity` false and exits 1. Applying it is what turns the gate green. Nothing else in this
-- change touches that guard, so `check:migrations` red + everything else green is the signature of
-- "the owner has not applied it yet", and any OTHER red is a real problem.
--
-- 🔴 IT IS DELIBERATELY UNAPPLIED, and the reason is other people's branches (ADR-1111). An applied
-- migration turns EVERY open branch whose tree lacks the file red on check:migrations. Five
-- branches were in flight the night this was written. Nothing in this change reads a new schema —
-- there is no schema change at all — so the apply-before-merge necessity ADR-1111 decision 1
-- describes does not arise here. Merge first, apply after. See ADR-1125.
--
-- ── REPAIR EVERY DEAD LINK IN EVERY STORED PAGE DOCUMENT (ADR-1125; backlog LIVE-104, LIVE-108,
--    LIVE-109; census scripts/stored-links.json; the retirement is ADR-1090).
--
-- The corpus was censused on 2026-08-24 (ADR-1115) and RE-MEASURED against production on
-- 2026-08-25 before this file was written. Both readings are identical, so no premise had expired:
--
--   store                        documents  hrefs set  targets
--   pages.data                           4          8  /onboarding/beta ×7, https://…/onboarding/beta ×1
--   pages.published_data                 1          5  /onboarding/beta ×4, https://…/onboarding/beta ×1
--   spaces.preferences.pageDocs         18         18  '#' ×18
--
-- 31 link props are set across 23 documents and NOT ONE of them points at a live address.
--
-- Two different causes, one repair path, and they are named apart rather than blurred together:
--
--   · THE 13 MARKETING HREFS are the stored-data half of ADR-1090. /onboarding/beta became /join;
--     the CODE was swept (lib/site.ts, every template, every route) and the DOCUMENTS were not,
--     because no gate read them. next.config.ts still 308s the old path, which is exactly why
--     nothing noticed. One of the 13 is written ABSOLUTE, so on a preview deployment the front
--     door's primary button navigates the reviewer out of the preview and into production.
--
--   · THE 18 '#' HREFS are a SEED, not an author's choice, which is why they are identical 18
--     times: lib/page-editor/templates/space-default.ts shipped ctaHref: '#'. The code half of that
--     is fixed in the same change as this file, and it turned out to be two defects rather than
--     one — see the note under step 2.
--
-- NOTHING HERE CHANGES A WORD A VISITOR READS. Every rewrite is an ADDRESS repair: no label, no
-- heading, no body, no block, no ordering. That line matters, because OWN-043 reserves the copy on
-- the published home document to the owner. Repairing an address that no longer exists is not
-- authorship; choosing what a button says or where it should newly point is. This file does only
-- the first. LIVE-104's remaining half — the home page offering the visitor a SECOND destination —
-- is the owner's authoring decision and is deliberately NOT performed here (ADR-1115 §4).


-- ── 1. THE 13 MARKETING HREFS -> /join ────────────────────────────────────────────────────────
--
-- Done as a whole-document text substitution on the QUOTED value, which is safe here and the
-- safety was MEASURED rather than assumed. Counted per document on 2026-08-25, the number of
-- occurrences of the bare substring `onboarding/beta` equals the number of complete quoted link
-- values in every single row (about 1=1, how-it-works 1=1, the-lab 1=1, home draft 5=4+1, home
-- published 5=4+1). So there is no prose mention, no partial path and no query string to damage —
-- every occurrence in the corpus IS a whole link value. The absolute form is replaced FIRST so the
-- relative pattern cannot strand the origin behind.

update pages
   set data = replace(
                replace(data::text, '"https://frequencylocal.com/onboarding/beta"', '"/join"'),
                '"/onboarding/beta"', '"/join"'
              )::jsonb
 where data::text like '%onboarding/beta%';

update pages
   set published_data = replace(
                          replace(published_data::text, '"https://frequencylocal.com/onboarding/beta"', '"/join"'),
                          '"/onboarding/beta"', '"/join"'
                        )::jsonb
 where published_data::text like '%onboarding/beta%';


-- ── 2. THE 18 SPACE CALLOUT BUTTONS ───────────────────────────────────────────────────────────
--
-- 🔴 THE ROW'S OWN REMEDY WOULD NOT HAVE WORKED, and this is the correction worth reading before
-- editing anything here. LIVE-109 proposed seeding an empty ctaHref "so the block draws no button
-- at all (SpaceCallout, like MediaText, renders its CTA only when label and href are both set)".
-- That is true of MediaText and was FALSE of SpaceCallout: it gated the button on `ctaLabel` alone
-- and rendered `href={ctaHref || '#'}`, so an empty href fell straight back to '#'. Blanking the
-- seed would have left all 18 buttons exactly as dead as they already were. The renderer is fixed
-- in the same change (components/page-editor/blocks/profile.tsx — SpaceCallout AND its twin
-- SpaceCTA, which carried the identical defect), and only because it is fixed does the '' arm
-- below actually remove a button.
--
-- WHERE THE BUTTON SHOULD POINT, decided from the data rather than from the template:
--
--   · Every one of the 18 documents contains a SpaceContact block, and SpaceContact renders inside
--     <section id="contact"> (the AnchorSection wrapper), so `#contact` is a real, already-existing
--     anchor on the page. That is the smallest honest target for a button labelled "Get in touch".
--
--   · BUT the section carries `empty:hidden`, and SpaceContactBlock returns null when it has no
--     rows. So `#contact` is only a real destination for a Space that actually has contact details.
--     Measured 2026-08-25 against preferences->'profileData' (the central Business Info the block
--     merges over its own props, which are empty in all 18 seeded documents): 16 of 18 have at
--     least one of address / hours / phone / email / website. TWO have none — `danny-kenduck` and
--     `templeofaset`. Sending those two to a collapsed, invisible section would be the same lie in
--     a new costume, so they get '' and, with the renderer fixed, simply draw no button until their
--     operator fills the Business Info in.
--
-- ⚠️ STATED RATHER THAN GLOSSED: this is a point-in-time decision over content that can change. A
-- Space that later CLEARS all its contact details keeps a '#contact' button pointing at a section
-- that no longer renders. The block cannot know — it has no access to the Space's profile data. A
-- durable fix is a SpaceCallout destination field that offers the page's live anchors rather than a
-- free-text box, which is editor work (PROG-E series), not a data repair. Filed as LIVE-115.

with target as (
  select s.id,
         case
           when coalesce(nullif(s.preferences->'profileData'->>'email',   ''), '') <> ''
             or coalesce(nullif(s.preferences->'profileData'->>'phone',   ''), '') <> ''
             or coalesce(nullif(s.preferences->'profileData'->>'address', ''), '') <> ''
             or coalesce(nullif(s.preferences->'profileData'->>'website', ''), '') <> ''
             or coalesce(nullif(s.preferences->'profileData'->>'hours',   ''), '') <> ''
           then '#contact'
           else ''
         end as href
    from spaces s
   where s.preferences ? 'pageDocs'
),
rewritten as (
  select s.id,
         jsonb_object_agg(
           d.key,
           case
             when jsonb_typeof(d.value->'content') = 'array'
             then jsonb_set(
                    d.value,
                    '{content}',
                    coalesce(
                      (select jsonb_agg(
                                case
                                  when blk->>'type' = 'SpaceCallout' and blk->'props'->>'ctaHref' = '#'
                                  then jsonb_set(blk, '{props,ctaHref}', to_jsonb(t.href))
                                  else blk
                                end
                                order by ord)
                         from jsonb_array_elements(d.value->'content') with ordinality x(blk, ord)),
                      '[]'::jsonb)
                  )
             else d.value
           end
         ) as page_docs
    from spaces s
    join target t on t.id = s.id
   cross join lateral jsonb_each(s.preferences->'pageDocs') d
   -- Touch only Spaces that actually carry a dead callout, so a SECOND run updates zero rows
   -- rather than rewriting 18 rows to their own value. See the idempotency note below.
   where exists (
     select 1
       from jsonb_each(s.preferences->'pageDocs') d2,
            lateral jsonb_array_elements(d2.value->'content') b
      where b->>'type' = 'SpaceCallout' and b->'props'->>'ctaHref' = '#'
   )
   group by s.id
)
update spaces s
   set preferences = jsonb_set(s.preferences, '{pageDocs}', r.page_docs)
  from rewritten r
 where r.id = s.id;


-- ── IDEMPOTENCY, AND WHAT A SECOND RUN DOES ───────────────────────────────────────────────────
--
-- BOTH statements are idempotent, and a second run is a genuine NO-OP rather than a harmless
-- repeat — it updates zero rows:
--
--   · step 1 is guarded by `where … like '%onboarding/beta%'`. After the first run no page row
--     matches, so nothing is written. Re-running cannot re-break a link: the substitution only ever
--     maps the retired address ONTO /join, never the other way.
--   · step 2 is guarded by the `where exists (… ctaHref = '#')` clause on the CTE. After the first
--     run no Space carries a '#' callout, the CTE is empty, and the UPDATE touches nothing. Without
--     that guard it would have rewritten all 18 preferences rows to their own value on every run.
--
-- Neither table carries a trigger (checked against information_schema.triggers on 2026-08-25:
-- `pages` and `spaces` have none), so there is no timestamp or audit side effect either way.
--
-- 🔴 IT IS PINNED TO THE CORPUS AS MEASURED, AND THAT IS DELIBERATE. The post-asserts hard-code
-- 36 / 13 / 207 / 18 / 16 / 2. If another branch's migration, or an operator in the editor, adds or
-- removes a page document, a Space, or a block before this is applied, those numbers stop being
-- true and this migration ABORTS the whole transaction instead of writing. That is the intended
-- behaviour — it refuses to run against a corpus it does not recognise — but it means the failure
-- mode on a stale constant is a loud rollback, not a silent corruption, and the fix is to
-- re-measure and update the constants, never to delete the assert.
--
-- ORDERING AGAINST SIBLING BRANCHES (ADR-1111): this migration may be applied BEFORE or AFTER any
-- sibling, in either order, PROVIDED no sibling changes the stored page-document corpus. It creates
-- no schema, so nothing depends on it and it depends on nothing. Re-running it after a sibling
-- lands undoes NOTHING: it only ever rewrites values that are still dead, and after the first run
-- there are none. The one real coupling is the file's VERSION — if a sibling claims
-- 20270323000000, renumber this file rather than the sibling, since nothing here is order-sensitive.


-- ── DRY-RUN EVIDENCE (2026-08-25) ─────────────────────────────────────────────────────────────
--
-- AGENTS.md: "a build-blocking gate that has never seen a real artifact is the 2026-08-11 incident
-- with the roles reversed." A migration that has never run is the same wager, so both statements
-- above were executed against PRODUCTION as SELECTs — the identical expressions, writing nothing —
-- and every post-assert constant below was read off the result rather than predicted:
--
--   step 1 (pages)   leftover `onboarding/beta` 0 · draft blocks 36 · published blocks 13 ·
--                    /join hrefs 8 draft + 5 published · rows whose ONLY textual change is the
--                    href substitution: all 4 (unexpected-diff count 0)
--   step 2 (spaces)  blocks 207 (unchanged) · SpaceCallout 18 (unchanged) · 16 -> '#contact' ·
--                    2 -> '' · still carrying '#': 0 · spaces rewritten 18
--   step 2 surgery   the full (space, page, ordinal, type, prop, value) multiset was diffed before
--                    against after with SpaceCallout.ctaHref excluded: 954 props compared, 0 lost,
--                    0 gained. Nothing but the one prop moves.
--
-- What a dry run still cannot prove is the apply path itself (trigger side effects, the ledger
-- repair). That is the owner's step 2, and README.md has it.


-- ── 3. POST-ASSERTS ───────────────────────────────────────────────────────────────────────────
--
-- Every number below was measured against production on 2026-08-25, before the rewrite. They run
-- inside the apply transaction, so any failure rolls the whole thing back. The COUNT assertions are
-- what stop a jsonb_agg from quietly dropping a block: that is the failure mode this shape has, and
-- an address repair that loses a section would be far worse than the bug it fixes.

do $$
declare
  n integer;
begin
  -- 3a. No stored document names the retired address any more, in either column.
  select count(*) into n from pages
   where coalesce(data::text, '') like '%onboarding/beta%'
      or coalesce(published_data::text, '') like '%onboarding/beta%';
  if n <> 0 then
    raise exception 'aborting: % page row(s) still name onboarding/beta', n;
  end if;

  -- 3b. The 13 repaired hrefs landed on /join. 8 in the drafts, 5 in the published document.
  select count(*) into n
    from pages p, lateral jsonb_array_elements(p.data->'content') e,
         lateral jsonb_each(e->'props') as pr(k, v)
   where jsonb_typeof(v) = 'string' and (k ilike '%href%' or k ilike '%url%' or k ilike '%link%')
     and v #>> '{}' = '/join';
  if n <> 8 then
    raise exception 'aborting: expected 8 /join hrefs across pages.data, found %', n;
  end if;

  select count(*) into n
    from pages p, lateral jsonb_array_elements(p.published_data->'content') e,
         lateral jsonb_each(e->'props') as pr(k, v)
   where p.published_data is not null
     and jsonb_typeof(v) = 'string' and (k ilike '%href%' or k ilike '%url%' or k ilike '%link%')
     and v #>> '{}' = '/join';
  if n <> 5 then
    raise exception 'aborting: expected 5 /join hrefs in pages.published_data, found %', n;
  end if;

  -- 3c. No block was lost or gained by either rewrite.
  select count(*) into n from pages p, lateral jsonb_array_elements(p.data->'content') e;
  if n <> 36 then
    raise exception 'aborting: pages.data block count moved from 36 to %', n;
  end if;

  select count(*) into n
    from pages p, lateral jsonb_array_elements(p.published_data->'content') e
   where p.published_data is not null;
  if n <> 13 then
    raise exception 'aborting: pages.published_data block count moved from 13 to %', n;
  end if;

  select count(*) into n
    from spaces s, lateral jsonb_each(s.preferences->'pageDocs') d,
         lateral jsonb_array_elements(d.value->'content') e;
  if n <> 207 then
    raise exception 'aborting: Space pageDocs block count moved from 207 to %', n;
  end if;

  -- 3d. All 18 callouts are still there, and not one of them still says '#'.
  select count(*) into n
    from spaces s, lateral jsonb_each(s.preferences->'pageDocs') d,
         lateral jsonb_array_elements(d.value->'content') e
   where e->>'type' = 'SpaceCallout';
  if n <> 18 then
    raise exception 'aborting: SpaceCallout block count moved from 18 to %', n;
  end if;

  select count(*) into n
    from spaces s, lateral jsonb_each(s.preferences->'pageDocs') d,
         lateral jsonb_array_elements(d.value->'content') e
   where e->>'type' = 'SpaceCallout' and e->'props'->>'ctaHref' = '#';
  if n <> 0 then
    raise exception 'aborting: % Space callout(s) still carry href #', n;
  end if;

  -- 3e. The 16/2 split landed as measured.
  select count(*) into n
    from spaces s, lateral jsonb_each(s.preferences->'pageDocs') d,
         lateral jsonb_array_elements(d.value->'content') e
   where e->>'type' = 'SpaceCallout' and e->'props'->>'ctaHref' = '#contact';
  if n <> 16 then
    raise exception 'aborting: expected 16 callouts pointing at #contact, found %', n;
  end if;

  select count(*) into n
    from spaces s, lateral jsonb_each(s.preferences->'pageDocs') d,
         lateral jsonb_array_elements(d.value->'content') e
   where e->>'type' = 'SpaceCallout' and e->'props'->>'ctaHref' = '';
  if n <> 2 then
    raise exception 'aborting: expected 2 callouts with no destination, found %', n;
  end if;

  -- 3f. The whole corpus, restated as ONE number: no stored link prop anywhere is dead.
  select count(*) into n from (
    select v #>> '{}' as href
      from pages p, lateral jsonb_array_elements(p.data->'content') e,
           lateral jsonb_each(e->'props') as pr(k, v)
     where jsonb_typeof(v) = 'string' and (k ilike '%href%' or k ilike '%url%' or k ilike '%link%')
    union all
    select v #>> '{}'
      from pages p, lateral jsonb_array_elements(p.published_data->'content') e,
           lateral jsonb_each(e->'props') as pr(k, v)
     where p.published_data is not null
       and jsonb_typeof(v) = 'string' and (k ilike '%href%' or k ilike '%url%' or k ilike '%link%')
    union all
    select v #>> '{}'
      from spaces s, lateral jsonb_each(s.preferences->'pageDocs') d,
           lateral jsonb_array_elements(d.value->'content') e,
           lateral jsonb_each(e->'props') as pr(k, v)
     where jsonb_typeof(v) = 'string' and (k ilike '%href%' or k ilike '%url%' or k ilike '%link%')
  ) all_links
   where href = '#' or href like '%/onboarding/beta%' or href like 'https://frequencylocal.com%';
  if n <> 0 then
    raise exception 'aborting: % stored link prop(s) still dead after the repair', n;
  end if;
end $$;

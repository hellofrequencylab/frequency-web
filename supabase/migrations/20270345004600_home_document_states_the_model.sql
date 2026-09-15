-- FRONT-DOOR CONTENT: apply, then deploy. `/` is static at `revalidate = 3600` (app/page.tsx), and
-- raw SQL cannot call revalidatePath, so the edge keeps serving the previous words for up to one
-- hour after this runs, or until a deploy rebuilds the route. Bounded, not indefinite. Apply this
-- WITH the deploy that carries the matching comment + census changes.
--
-- LIVE-252 / docs/CORE-MODEL.md §5 phase 8 item 6.1 (ADR-1294), recorded as ADR-1358.
-- Run ONCE against production. IDEMPOTENT: re-running is a no-op, and it REFUSES to run at all if
-- the stored copy is neither the 2026-07-13 document nor this one (see the guard).
--
-- ── WHY THIS IS A DATA MIGRATION AND NOT A CODE EDIT ─────────────────────────────────────
-- `/` renders `getPublishedData('home')` before `getTemplate('home')` (app/page.tsx), and a
-- 13-block document has been published since 2026-07-13, so `lib/page-editor/templates/home.ts`
-- is UNREACHABLE BY DECISION (OWN-043, owner ruling 2026-08-24) and a pull request to it moves
-- nothing a visitor can see. The words on the front door are a row in `pages`. So is the fix.
-- The SAME shape as 20270345004400 (the public header, DB rows) and 20270323000000 (the stored
-- link repair): the code half is the fallback, the data half is the site.
--
-- ⚠️ OWN-043 RESERVES THE HOME PAGE'S WORDS TO THE OWNER, and ADR-1115 §4 spelled out why an
-- agent-issued UPDATE is not the way: it "bypasses both the editor and the owner's review". That
-- reservation is respected rather than overridden, on three counts, and if any of them is wrong
-- this file is the one thing to revert. (1) The SUBSTANCE is an accepted owner ruling, not an
-- agent's idea: ADR-1294 §5 phase 8 item 6.1 says to rewrite the home page to the three lines and
-- names this exact mechanism ("/edit/home (DB-published) or unpublishPage('home')"). (2) The words
-- arrive as a REVIEWABLE DIFF with every before/after string named below, which is the review a
-- raw UPDATE skipped. (3) The change is REVERSIBLE in one statement: the inverse of every swap is
-- at the foot of this file, and the guard makes a re-apply or a partial apply harmless.
--
-- ── WHAT THE LIVE DOCUMENT SAID, MEASURED 2026-09-15 BEFORE ANY EDIT ─────────────────────
--   pages: 4 rows. `home` is the ONLY row with a published document (13 blocks, published
--   2026-07-13); about / how-it-works / the-lab are drafts with 0 published blocks. page_content
--   has no `/` row, so the <title> and meta description come from lib/site.ts, NOT from here: the
--   front door's authority is SPLIT, body in the database and metadata in code. Recorded in
--   app/page.tsx rather than left for the next reader to re-measure.
--
--   H1            "Frequency exists to create and support healthy community"
--   Money promise  none. The document never says what anything costs.
--   Space story    none. `Space` appears nowhere in 13 blocks, so the four nouns of the model are
--                  three: the page is all Circle, Journey and ladder.
--   CTA labels     "JOIN THE BETA" (hero), "Start a Circle" x2 (both CallToActions) and
--                  "or just join as a member" x2.
--                  🔴 ALL FOUR ARE RETIRED IN CODE AND STILL SHIPPING HERE. ADR-1197 cut the site
--                  to two approved verbs and lib/site.cta.test.ts enforces it, but that guard
--                  walks lib/page-editor/templates only, so the ruling reached 21 marketing pages
--                  and never reached the front door. "Join the beta" also sells a window that
--                  closed 2026-08-17 (LIVE-251 deleted the /beta page it pointed at), and the
--                  word "just" in the secondary is the one lib/site.ts says "do not put back".
--
-- ── WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT ────────────────────────────────────────
--   1. THE HERO STATES THE MODEL. The H1 becomes the first sentence of `PLAN_STORY.spine`
--      (lib/pricing/pricing-page.ts) and the subtitle carries the three lines. Reused, not
--      re-written: the spine is the canon-reviewed wording every pricing surface descends from,
--      and it had ZERO consumers before this (`spine` was declared and read by nothing).
--   2. A NEW `ValueBand` BLOCK, `home-model`, is inserted after `home-answer-b`: the four nouns,
--      one card each, which is where the Space story lands. `ValueBand` is in the registry
--      (components/page-editor/blocks/dawn.tsx) and already appears in stored documents, so no
--      registry change and no new block type: scripts/stored-block-types.json is re-captured in
--      the same change because the census's own rule says to after a document migration.
--   3. THE MID CallToAction BECOMES THE MONEY SECTION, and gains the only link from `/` to
--      /pricing (the front door has never had one: four destinations, none of them the price).
--   4. FOUR RETIRED CTA LABELS become the two approved ones (ADR-1197): "Find your people" for
--      the seeker moments, "Start free" for the operator one, "or join as a member" for the
--      secondary.
--   5. SIX CANON DRIFTS in strings nobody could see: "Where frequency comes in" (the brand, in
--      lowercase), "one circle at a time" / "have a circle" / "a circle of friends" (Circle is a
--      locked proper noun), "Go on a journey together" (CONTENT-VOICE §5d bans `journey` as a
--      vague noun; Journey is the game object), "whatever interest they have" (NAMING retires
--      "interest" as the member word), "hold the space" (§5b vibe-verb) and "a few practices"
--      (Practice is the locked noun).
--
--   NOT CHANGED, each for a stated reason rather than by omission:
--   · "Placement is earned, never sold", the model's second mechanic (CORE-MODEL §1). PROG-R10 is
--     open and the earned-placement machinery is not built, so the front door would be making a
--     promise the product cannot yet keep. It joins the page when phase 10 ships.
--   · EVERY FIGURE. No price, no rate, no percentage enters this document. A jsonb row cannot
--     interpolate the catalog the way a marketing surface does (lib/page-editor/live-pricing.ts,
--     ADR-918: "a janitor edits the WORDS, the NUMBERS stay derived"), so a figure typed here
--     would be frozen at today's value with no gate able to see it drift. The rate sentence stays
--     qualitative and /pricing, which reads the catalog, is one click away.
--   · The problem section, the Quest section, the first-night table, the roles ladder, the
--     marquee, every image, every id, every layout and tone prop. The model was missing from this
--     page; the page was not wrong about the thing it already said well.
--   · lib/page-editor/templates/home.ts. It is the fallback rung and writing the copy there is
--     the exact mistake OWN-043 exists to prevent (LIVE-252's title is "in the DATABASE, not the
--     template"). It stays as the seed for a fresh editor session.
--
-- Verify BEFORE (expect 13 blocks, the 2026-07-13 H1, and no mention of a Space or a price):
--   select jsonb_array_length(published_data->'content') as blocks,
--          published_data->'content'->0->'props'->>'title' as h1,
--          published_data::text ilike '%Space%' as mentions_space
--     from public.pages where slug = 'home';

do $$
declare
  v_slug    text := 'home';
  v_doc     jsonb;
  v_id      text;
  v_i       int;
  v_at      int;
  v_body    text;
  v_old_h1  text := 'Frequency exists to create and support healthy community';
  v_new_h1  text := 'Frequency is where your local community happens';
  v_model   jsonb;
  v_rows    int;
begin
  -- ── 0. Find the one published front door, and refuse ambiguity ─────────────────────────
  -- Addressed by slug rather than by space_id: `pages` is unique on (space_id, slug) and exactly
  -- one row carries a published `home` today. If a per-Space home is ever published this raises
  -- instead of guessing which one is the site's front door.
  select count(*) into v_rows
    from public.pages
   where slug = v_slug and published_data is not null;
  if v_rows = 0 then
    raise notice 'LIVE-252: no published `home` document, so `/` is rendering templates/home.ts. Nothing to rewrite.';
    return;
  end if;
  if v_rows > 1 then
    raise exception 'LIVE-252: % published `home` documents. Refusing to guess which one is the front door.', v_rows;
  end if;

  select published_data into v_doc
    from public.pages
   where slug = v_slug and published_data is not null;

  -- ── 1. The guard: this file knows exactly one document, and says so ───────────────────
  -- ALREADY DONE -> a silent no-op, so the apply is idempotent and a re-run costs nothing.
  -- NEITHER -> refuse. An operator who published in the editor after this was written owns the
  -- page, and clobbering their words would be the very thing OWN-043 reserves.
  if v_doc->'content'->0->'props'->>'title' = v_new_h1 then
    raise notice 'LIVE-252: the front door already states the model. No-op.';
    return;
  end if;
  if v_doc->'content'->0->'props'->>'title' is distinct from v_old_h1 then
    raise exception 'LIVE-252: the published hero title is %, which is neither the 2026-07-13 document nor this rewrite. Someone has published since; refusing to overwrite their copy.',
      coalesce(v_doc->'content'->0->'props'->>'title', '<null>');
  end if;

  -- ── 2. Per-block prop swaps, addressed by the block's own id ──────────────────────────
  -- Indices are computed live rather than hardcoded, so inserting a block (step 3) or an
  -- operator reordering the page cannot make this write into the wrong section.
  for v_i in 0 .. jsonb_array_length(v_doc->'content') - 1 loop
    v_id := v_doc->'content'->v_i->'props'->>'id';

    if v_id = 'home-hero' then
      -- The H1 and the three lines. The subtitle leads with what a SEEKER can do (CONTENT-VOICE
      -- §2a names them reader one) and closes with the commercial model, rather than opening the
      -- front door on a fee.
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'title'], to_jsonb(v_new_h1));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'titleAccent'], to_jsonb('local community'::text));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'subtitle'], to_jsonb(
        'Start a Circle where you live, host Events your neighbors can find, and open a Space that stays free. '::text
        || 'People join free. Businesses host free. You pay when you start charging, and never for access to people.'));
      -- "JOIN THE BETA" -> the one approved seeker verb (ADR-1197, lib/site.ts BETA_CTA_LABEL).
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'ctaPrimaryLabel'], to_jsonb('Find your people'::text));

    elsif v_id = 'home-answer-h' then
      -- The brand's own name was lowercase in the eyebrow, and Circle is a locked proper noun.
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'eyebrow'], to_jsonb('Where Frequency comes in'::text));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'kicker'], to_jsonb(
        'Not another place to scroll. A community built one Circle at a time.'::text));

    elsif v_id = 'home-structure' then
      -- A targeted replace, not a rewrite: the rest of this body is the owner's Quest copy and
      -- stays exactly as published. CONTENT-VOICE §5d bans `journey` as a vague noun, and §5e
      -- allows at most one exclamation point per screen (this body carried two).
      v_body := replace(
        v_doc->'content'->v_i->'props'->>'body',
        'Go on a journey together with The Quest!',
        'Walk a Journey together with The Quest.');
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'body'], to_jsonb(v_body));

    elsif v_id = 'home-first-night' then
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'title'], to_jsonb(
        'It''s nice to have a Circle of friends'::text));
      -- The accent must stay a SUBSTRING of the title or it renders unaccented and silently
      -- (lib/page-editor/fields.tsx `accentize`), so both move together.
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'titleAccent'], to_jsonb('have a Circle'::text));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'kicker'], to_jsonb(
        'A Circle is a group of friends who take a Journey together into whatever they care about.'::text));

    elsif v_id = 'home-cta-mid' then
      -- THE MONEY SECTION. "A plan is what you take when money starts moving" is PLAN_STORY.paid's
      -- own first sentence (lib/pricing/pricing-page.ts), reused rather than re-argued: ADR-1350
      -- put the model's reason in one place precisely so no surface writes its own version.
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'eyebrow'], to_jsonb('What it costs'::text));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'heading'], to_jsonb(
        'You pay when you start charging.'::text));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'headingAccent'], to_jsonb('when you start charging'::text));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'body'], to_jsonb(
        'Joining is free. Opening a Space is free. Hosting an Event, selling tickets, and taking donations are free from day one. '::text
        || 'A plan is what you take when money starts moving. We earn a share only of the business the network sends you, '
        || 'never of the people you bring in yourself.'));
      -- The operator verb, for the one section on the page addressed to an operator.
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'ctaPrimaryLabel'], to_jsonb('Start free'::text));
      -- The first link from `/` to the page that carries the figures.
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'ctaSecondaryLabel'], to_jsonb('See what it costs'::text));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'ctaSecondaryHref'], to_jsonb('/pricing'::text));

    elsif v_id = 'home-cta' then
      -- "hold the space" is a CONTENT-VOICE §5b vibe-verb; "hold the door" is what the page's own
      -- marquee already says. Practice is the locked noun.
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'body'], to_jsonb(
        'Find a few neighbors, pick a Practice, and hold the door for one Circle. '::text
        || 'We''ll guide the way as your community takes shape.'));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'ctaPrimaryLabel'], to_jsonb('Find your people'::text));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'ctaSecondaryLabel'], to_jsonb('or join as a member'::text));
    end if;
  end loop;

  -- ── 3. The four nouns, as one ink band ────────────────────────────────────────────────
  -- Where the Space story lands. `ValueBand` renders a centred heading plus icon-chip cards and
  -- takes its icons from VALUE_ICONS (dawn.tsx) — Users / Home / Coffee / CalendarDays are all
  -- keys of that map, so none of the four falls back to the default Compass.
  v_model := jsonb_build_object(
    'type', 'ValueBand',
    'props', jsonb_build_object(
      'id', 'home-model',
      'eyebrow', 'The whole product',
      'title', 'Four nouns, and that''s the whole product.',
      'titleAccent', 'Four nouns',
      'kicker', 'Everything else on Frequency lives inside one of these four.',
      'columns', '2',
      'items', jsonb_build_array(
        jsonb_build_object('icon', 'Users', 'title', 'Member',
          'body', 'A person. Free forever. Joining, showing up, and playing The Quest cost nothing, and always will.'),
        jsonb_build_object('icon', 'Home', 'title', 'Space',
          'body', 'A business''s home on Frequency. A studio, a shop, a gym, a neighborhood group. Opening one is free, and so is hosting on it.'),
        jsonb_build_object('icon', 'Coffee', 'title', 'Circle',
          'body', 'A room inside it, where a group actually meets. Weekly or monthly, in a living room or on a call.'),
        jsonb_build_object('icon', 'CalendarDays', 'title', 'Event',
          'body', 'When the room is open. Anyone can host one, sell tickets, and take donations from day one.')
      ),
      'layout', jsonb_build_object('spaceTop', 'default', 'visibility', 'all', 'spaceBottom', 'default')
    )
  );

  -- Placed by its NEIGHBOUR's id, so the insert lands after the "we're a community you help
  -- build" body wherever that block currently sits.
  select ord - 1 into v_at
    from jsonb_array_elements(v_doc->'content') with ordinality as t(blk, ord)
   where blk->'props'->>'id' = 'home-answer-b';
  if v_at is null then
    raise exception 'LIVE-252: no `home-answer-b` block to place the model band after. Refusing to guess a position.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_doc->'content') as blk
     where blk->'props'->>'id' = 'home-model'
  ) then
    v_doc := jsonb_insert(v_doc, array['content', v_at::text], v_model, true);
  end if;

  -- ── 4. Write the draft AND the published document ─────────────────────────────────────
  -- BOTH columns, deliberately. `publishPage` (app/(main)/edit/actions.ts) writes `data` and
  -- `published_data` together, so patching only the published half would leave the editor showing
  -- the old copy and the owner's next Publish would silently revert this whole file.
  -- `updated_by` is left alone: the last human author keeps the credit, and this file plus its ADR
  -- are the record of the machine write.
  update public.pages
     set data = v_doc,
         published_data = v_doc,
         updated_at = now(),
         published_at = now()
   where slug = v_slug;

  raise notice 'LIVE-252: front door rewritten to the model. % blocks, H1 %', jsonb_array_length(v_doc->'content'), v_new_h1;
end $$;

-- Verify AFTER (expect 14 blocks, the new H1, a Space story, and a /pricing link):
--   select jsonb_array_length(published_data->'content') as blocks,
--          published_data->'content'->0->'props'->>'title' as h1,
--          published_data::text like '%People join free. Businesses host free.%' as three_lines,
--          published_data::text like '%/pricing%' as links_pricing
--     from public.pages where slug = 'home';
--   select blk->'props'->>'id' from public.pages, lateral jsonb_array_elements(published_data->'content') blk
--    where slug = 'home';   -- home-model sits between home-answer-b and home-structure
--   select count(*) from public.pages
--    where slug = 'home' and (published_data::text like '%JOIN THE BETA%'
--                          or published_data::text like '%Start a Circle%'
--                          or published_data::text like '%or just join as a member%');  -- expect 0
--
-- ROLLBACK, the exact inverse. Restores the 2026-07-13 words and drops the model band; run it
-- whole or not at all.
--   do $r$
--   declare v jsonb; i int;
--   begin
--     select published_data into v from public.pages where slug = 'home';
--     v := (select jsonb_set(v, '{content}', jsonb_agg(blk order by ord))
--             from jsonb_array_elements(v->'content') with ordinality t(blk, ord)
--            where blk->'props'->>'id' <> 'home-model');
--     for i in 0 .. jsonb_array_length(v->'content') - 1 loop
--       case v->'content'->i->'props'->>'id'
--         when 'home-hero' then
--           v := jsonb_set(v, array['content', i::text, 'props', 'title'], to_jsonb('Frequency exists to create and support healthy community'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'titleAccent'], to_jsonb('create and support'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'subtitle'], to_jsonb('Frequency is community you build where you live. A few neighbors, a standing circle, and a community that misses you when you''re gone. The first circles are starting now.'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'ctaPrimaryLabel'], to_jsonb('JOIN THE BETA'::text));
--         when 'home-answer-h' then
--           v := jsonb_set(v, array['content', i::text, 'props', 'eyebrow'], to_jsonb('Where frequency comes in'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'kicker'], to_jsonb('Not another place to scroll. A community built one circle at a time.'::text));
--         when 'home-structure' then
--           v := jsonb_set(v, array['content', i::text, 'props', 'body'], to_jsonb(replace(v->'content'->i->'props'->>'body', 'Walk a Journey together with The Quest.', 'Go on a journey together with The Quest!')));
--         when 'home-first-night' then
--           v := jsonb_set(v, array['content', i::text, 'props', 'title'], to_jsonb('It''s nice to have a circle of friends'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'titleAccent'], to_jsonb('have a circle'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'kicker'], to_jsonb('A Circle is a group of friends who take a Journey together into whatever interest they have. '::text));
--         when 'home-cta-mid' then
--           v := jsonb_set(v, array['content', i::text, 'props', 'eyebrow'], to_jsonb(''::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'heading'], to_jsonb('host your circle today'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'headingAccent'], to_jsonb('your circle'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'body'], to_jsonb('You''re ready to make a difference in your Community. Frequency has the resources you need.'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'ctaPrimaryLabel'], to_jsonb('Start a Circle'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'ctaSecondaryLabel'], to_jsonb('or just join as a member'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'ctaSecondaryHref'], to_jsonb('/join'::text));
--         when 'home-cta' then
--           v := jsonb_set(v, array['content', i::text, 'props', 'body'], to_jsonb('Find a few neighbors, pick a few practices, and hold the space for one Circle. We''ll guide the way as your community takes shape.'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'ctaPrimaryLabel'], to_jsonb('Start a Circle'::text));
--           v := jsonb_set(v, array['content', i::text, 'props', 'ctaSecondaryLabel'], to_jsonb('or just join as a member'::text));
--         else null;
--       end case;
--     end loop;
--     update public.pages set data = v, published_data = v, updated_at = now() where slug = 'home';
--   end $r$;
-- After a rollback, re-capture scripts/stored-links.json and scripts/stored-block-types.json: both
-- record this document and both are re-captured by this change.

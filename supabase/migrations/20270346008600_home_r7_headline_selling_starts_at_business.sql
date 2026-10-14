-- FRONT-DOOR CONTENT: apply, then deploy. `/` is static at `revalidate = 3600` (app/page.tsx), and raw
-- SQL cannot call revalidatePath, so the edge keeps the previous words for up to an hour after this runs,
-- or until a deploy rebuilds the route. Apply it WITH the deploy that carries the matching template and
-- home-copy-canon changes.
--
-- LIVE-910 / docs/LAUNCH-MARKETING-PLAN.md §14 Phase 0.1, ruling R7 (ADR-1735). IDEMPOTENT (a re-run is a
-- no-op) and GUARDED (it refuses if the stored copy is neither the 2026-09-15 document nor this one).
--
-- ── WHY A DATA MIGRATION ────────────────────────────────────────────────────────────────────────────
-- `/` renders the published `pages` row before lib/page-editor/templates/home.ts (OWN-043), so the words
-- on the front door are a row, and so is the fix. Same mechanism and shape as 20270345004600.
--
-- ── OWNER REVIEW (OWN-043 reserves the home page's words to the owner) ──────────────────────────────
-- The owner approved every string below in chat on 2026-10-13: the R7 headline and subhead as ruled, and
-- the two money lines, which follow ADR-1709 and PLAN_STORY.selling (lib/pricing/plan-story.ts).
--
-- ── WHAT CHANGES, MEASURED IN PRODUCTION 2026-10-13 BEFORE ANY EDIT ─────────────────────────────────
--   home-hero      title     "Frequency is where your local community happens"
--                         ->  "Your people are closer than you think."                     (R7)
--                  accent    "local community" -> "closer than you think" (an accent must stay a substring)
--                  subtitle  "Start a Circle where you live, … You pay when you start charging, and never
--                             for access to people."
--                         ->  "Small groups that keep meeting, near you. Join free. Businesses host free."
--   home-model     Event card "… Anyone can host one, sell tickets, and take donations from day one."
--                         ->  "… Anyone can host one for free. Paid tickets and donations open at Business."
--   home-cta-mid   body      "… selling tickets, and taking donations are free from day one. …"
--                         ->  the approved line below. The heading "You pay when you start charging."
--                             stays, so the three model lines (CORE-MODEL §1) all remain on the page.
--
-- The rollback, the exact inverse, is at the foot of this file.

do $$
declare
  v_slug       text := 'home';
  v_doc        jsonb;
  v_id         text;
  v_i          int;
  v_rows       int;
  v_old_h1     text := 'Frequency is where your local community happens';
  v_new_h1     text := 'Your people are closer than you think.';
  v_new_sub    text := 'Small groups that keep meeting, near you. Join free. Businesses host free.';
  v_old_event  text := 'When the room is open. Anyone can host one, sell tickets, and take donations from day one.';
  v_new_event  text := 'When the room is open. Anyone can host one for free. Paid tickets and donations open at Business.';
  v_old_cta    text := 'Joining is free. Opening a Space is free. Hosting an Event, selling tickets, and taking donations are free from day one. A plan is what you take when money starts moving. We earn a share only of the business the network sends you, never of the people you bring in yourself.';
  v_new_cta    text := 'Joining is free. Opening a Space is free. Hosting an Event is free. Selling starts at Business: paid tickets, paid memberships, donations, shop checkout and booking deposits open there. Tips stay open on every tier, with no fee. We earn a share only of the business the network sends you, never of the people you bring in yourself.';
  v_items      jsonb;
  v_as_string  boolean;
  v_j          int;
begin
  select count(*) into v_rows from public.pages where slug = v_slug and published_data is not null;
  if v_rows = 0 then
    raise notice 'LIVE-910: no published `home` document; `/` renders templates/home.ts. Nothing to rewrite.';
    return;
  end if;
  if v_rows > 1 then
    raise exception 'LIVE-910: % published `home` documents. Refusing to guess which one is the front door.', v_rows;
  end if;

  select published_data into v_doc from public.pages where slug = v_slug and published_data is not null;

  -- The guard. Already done -> no-op. Neither document -> refuse: someone published since, and their
  -- words are theirs (OWN-043).
  if v_doc->'content'->0->'props'->>'title' = v_new_h1 then
    raise notice 'LIVE-910: the front door already carries R7 and the selling line. No-op.';
    return;
  end if;
  if v_doc->'content'->0->'props'->>'title' is distinct from v_old_h1 then
    raise exception 'LIVE-910: the published hero title is %, not the 2026-09-15 document. Refusing to overwrite.',
      coalesce(v_doc->'content'->0->'props'->>'title', '<null>');
  end if;

  for v_i in 0 .. jsonb_array_length(v_doc->'content') - 1 loop
    v_id := v_doc->'content'->v_i->'props'->>'id';

    if v_id = 'home-hero' then
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'title'], to_jsonb(v_new_h1));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'titleAccent'], to_jsonb('closer than you think'::text));
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'subtitle'], to_jsonb(v_new_sub));

    elsif v_id = 'home-model' then
      -- The band may store its items as a JSON string (the 2026-09-15 document does); handle both shapes.
      v_as_string := jsonb_typeof(v_doc->'content'->v_i->'props'->'items') = 'string';
      v_items := case when v_as_string
                      then (v_doc->'content'->v_i->'props'->>'items')::jsonb
                      else v_doc->'content'->v_i->'props'->'items' end;
      for v_j in 0 .. jsonb_array_length(v_items) - 1 loop
        if v_items->v_j->>'body' = v_old_event then
          v_items := jsonb_set(v_items, array[v_j::text, 'body'], to_jsonb(v_new_event));
        end if;
      end loop;
      if position('day one' in v_items::text) > 0 then
        raise exception 'LIVE-910: the home-model Event card no longer matches the measured text; refusing.';
      end if;
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'items'],
        case when v_as_string then to_jsonb(v_items::text) else v_items end);

    elsif v_id = 'home-cta-mid' then
      if v_doc->'content'->v_i->'props'->>'body' is distinct from v_old_cta then
        raise exception 'LIVE-910: the home-cta-mid body no longer matches the measured text; refusing.';
      end if;
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'body'], to_jsonb(v_new_cta));
    end if;
  end loop;

  if position('from day one' in v_doc::text) > 0 then
    raise exception 'LIVE-910: a "from day one" money claim is still in the document after the rewrite; refusing.';
  end if;

  update public.pages
     set published_data = v_doc,
         updated_at = now()
   where slug = v_slug and published_data is not null;

  raise notice 'LIVE-910: the front door carries R7 and says selling starts at Business.';
end $$;

-- ROLLBACK, the exact inverse. Run by hand only if the owner reverses R7 or the money lines:
--
-- do $$
-- declare v_doc jsonb; v_i int; v_items jsonb; v_j int; v_str boolean;
-- begin
--   select published_data into v_doc from public.pages where slug = 'home' and published_data is not null;
--   for v_i in 0 .. jsonb_array_length(v_doc->'content') - 1 loop
--     if v_doc->'content'->v_i->'props'->>'id' = 'home-hero' then
--       v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'title'], to_jsonb('Frequency is where your local community happens'::text));
--       v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'titleAccent'], to_jsonb('local community'::text));
--       v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'subtitle'], to_jsonb('Start a Circle where you live, host Events your neighbors can find, and open a Space that stays free. People join free. Businesses host free. You pay when you start charging, and never for access to people.'::text));
--     elsif v_doc->'content'->v_i->'props'->>'id' = 'home-model' then
--       v_str := jsonb_typeof(v_doc->'content'->v_i->'props'->'items') = 'string';
--       v_items := case when v_str then (v_doc->'content'->v_i->'props'->>'items')::jsonb else v_doc->'content'->v_i->'props'->'items' end;
--       for v_j in 0 .. jsonb_array_length(v_items) - 1 loop
--         if v_items->v_j->>'body' = 'When the room is open. Anyone can host one for free. Paid tickets and donations open at Business.' then
--           v_items := jsonb_set(v_items, array[v_j::text, 'body'], to_jsonb('When the room is open. Anyone can host one, sell tickets, and take donations from day one.'::text));
--         end if;
--       end loop;
--       v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'items'], case when v_str then to_jsonb(v_items::text) else v_items end);
--     elsif v_doc->'content'->v_i->'props'->>'id' = 'home-cta-mid' then
--       v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'body'], to_jsonb('Joining is free. Opening a Space is free. Hosting an Event, selling tickets, and taking donations are free from day one. A plan is what you take when money starts moving. We earn a share only of the business the network sends you, never of the people you bring in yourself.'::text));
--     end if;
--   end loop;
--   update public.pages set published_data = v_doc, updated_at = now() where slug = 'home' and published_data is not null;
-- end $$;

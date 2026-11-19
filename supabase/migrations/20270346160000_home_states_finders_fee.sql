-- FRONT-DOOR CONTENT (LIVE-2446, ADR-1978): apply, then deploy. `/` is static at `revalidate = 3600`
-- (app/page.tsx), and raw SQL cannot call revalidatePath, so the edge keeps the previous words for up to
-- an hour after this runs, or until a deploy rebuilds the route.
--
-- IDEMPOTENT (a re-run is a no-op) and GUARDED (it refuses if the stored copy is neither the LIVE-910
-- document nor this one). Same mechanism and shape as 20270346008600.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────────────────────────
-- `/` renders the published `pages` row before lib/page-editor/templates/home.ts (OWN-043), so the money
-- lines on the front door are a row. The owner ruled the new take rate system on 2026-11-18 (ADR-1978):
-- 0% on your own people plus card processing, one finder's fee charged once and capped, only a paying
-- account takes money (a free Space sells nothing and takes donations and tips because it comes with
-- Crew). The owner asked the same night to "fully update every bit of copy on the site".
--
-- ── WHAT CHANGES, MEASURED IN PRODUCTION 2026-11-19 BEFORE ANY EDIT ────────────────────────────────
--   home-cta-mid   body  "… Selling starts at Business: paid tickets, paid memberships, donations, shop
--                         checkout and booking deposits open there. Tips stay open on every tier, with no
--                         fee. We earn a share only of the business the network sends you, never of the
--                         people you bring in yourself."
--                     ->  the line below (no tips on every tier, the finder's fee named and capped)
--   home-model     Event card "… Anyone can host one for free. Paid tickets and donations open at Business."
--                     ->  "… Anyone can host one for free. Paid tickets open at Business."
--
-- The rollback, the exact inverse, is at the foot of this file.

do $$
declare
  v_slug       text := 'home';
  v_doc        jsonb;
  v_id         text;
  v_i          int;
  v_rows       int;
  v_old_event  text := 'When the room is open. Anyone can host one for free. Paid tickets and donations open at Business.';
  v_new_event  text := 'When the room is open. Anyone can host one for free. Paid tickets open at Business.';
  v_old_cta    text := 'Joining is free. Opening a Space is free. Hosting an Event is free. Selling starts at Business: paid tickets, paid memberships, donations, shop checkout and booking deposits open there. Tips stay open on every tier, with no fee. We earn a share only of the business the network sends you, never of the people you bring in yourself.';
  v_new_cta    text := 'Joining is free. Opening a Space is free, and it comes with Crew, so it can take donations and tips. Hosting an Event is free. Selling starts at Business: paid tickets, paid memberships, shop checkout and booking deposits open there. Your own people cost 0%, plus card processing. We earn one capped finder’s fee, once, only on a customer the network sends you, never on the people you bring in yourself.';
  v_items      jsonb;
  v_as_string  boolean;
  v_j          int;
  v_cta_body   text;
begin
  select count(*) into v_rows from public.pages where slug = v_slug and published_data is not null;
  if v_rows = 0 then
    raise notice 'LIVE-2446: no published `home` document; `/` renders templates/home.ts. Nothing to rewrite.';
    return;
  end if;
  if v_rows > 1 then
    raise exception 'LIVE-2446: % published `home` documents. Refusing to guess which one is the front door.', v_rows;
  end if;

  select published_data into v_doc from public.pages where slug = v_slug and published_data is not null;

  for v_i in 0 .. jsonb_array_length(v_doc->'content') - 1 loop
    v_id := v_doc->'content'->v_i->'props'->>'id';

    if v_id = 'home-model' then
      v_as_string := jsonb_typeof(v_doc->'content'->v_i->'props'->'items') = 'string';
      v_items := case when v_as_string
                      then (v_doc->'content'->v_i->'props'->>'items')::jsonb
                      else v_doc->'content'->v_i->'props'->'items' end;
      for v_j in 0 .. jsonb_array_length(v_items) - 1 loop
        if v_items->v_j->>'body' = v_old_event then
          v_items := jsonb_set(v_items, array[v_j::text, 'body'], to_jsonb(v_new_event));
        end if;
      end loop;
      v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'items'],
        case when v_as_string then to_jsonb(v_items::text) else v_items end);

    elsif v_id = 'home-cta-mid' then
      v_cta_body := v_doc->'content'->v_i->'props'->>'body';
      if v_cta_body = v_new_cta then
        null; -- already done
      elsif v_cta_body is distinct from v_old_cta then
        raise exception 'LIVE-2446: the home-cta-mid body no longer matches the measured text; refusing (OWN-043).';
      else
        v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'body'], to_jsonb(v_new_cta));
      end if;
    end if;
  end loop;

  if position('Tips stay open on every tier' in v_doc::text) > 0 then
    raise exception 'LIVE-2446: "tips on every tier" is still in the document after the rewrite; refusing.';
  end if;

  update public.pages
     set published_data = v_doc,
         updated_at = now()
   where slug = v_slug and published_data is not null
     and published_data is distinct from v_doc;

  raise notice 'LIVE-2446: the front door states the finder''s fee and the paying-account rule.';
end $$;

-- ROLLBACK, the exact inverse. Run by hand only if the owner reverses ADR-1978's copy:
--
-- do $$
-- declare v_doc jsonb; v_i int; v_items jsonb; v_j int; v_str boolean;
-- begin
--   select published_data into v_doc from public.pages where slug = 'home' and published_data is not null;
--   for v_i in 0 .. jsonb_array_length(v_doc->'content') - 1 loop
--     if v_doc->'content'->v_i->'props'->>'id' = 'home-model' then
--       v_str := jsonb_typeof(v_doc->'content'->v_i->'props'->'items') = 'string';
--       v_items := case when v_str then (v_doc->'content'->v_i->'props'->>'items')::jsonb else v_doc->'content'->v_i->'props'->'items' end;
--       for v_j in 0 .. jsonb_array_length(v_items) - 1 loop
--         if v_items->v_j->>'body' = 'When the room is open. Anyone can host one for free. Paid tickets open at Business.' then
--           v_items := jsonb_set(v_items, array[v_j::text, 'body'], to_jsonb('When the room is open. Anyone can host one for free. Paid tickets and donations open at Business.'::text));
--         end if;
--       end loop;
--       v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'items'], case when v_str then to_jsonb(v_items::text) else v_items end);
--     elsif v_doc->'content'->v_i->'props'->>'id' = 'home-cta-mid' then
--       v_doc := jsonb_set(v_doc, array['content', v_i::text, 'props', 'body'], to_jsonb('Joining is free. Opening a Space is free. Hosting an Event is free. Selling starts at Business: paid tickets, paid memberships, donations, shop checkout and booking deposits open there. Tips stay open on every tier, with no fee. We earn a share only of the business the network sends you, never of the people you bring in yourself.'::text));
--     end if;
--   end loop;
--   update public.pages set published_data = v_doc, updated_at = now() where slug = 'home' and published_data is not null;
-- end $$;

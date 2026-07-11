-- ─────────────────────────────────────────────────────────────────────────────
-- DATA FIX (WRITE-ONLY, not auto-applied): strip retired blocks from SAVED event layouts.
--
-- The '/events/*' DEFAULT layout (lib/page-settings/default-layouts.ts) already drops three blocks
-- (#1675 + the Event page overhaul):
--   • event-pricing — the poster "Pricing" box; ticketing lives in the Join box now.
--   • event-sales   — the host ticket-sales list; also folded into the Join/ticketing flow.
--   • event-location — the side "Location & map" card; it rendered a SECOND venue map alongside the
--                      bottom-of-main `event-venue-map`, so a saved layout showed the map TWICE.
-- But a page with a SAVED page_settings.layout (an operator arranged it before the default changed,
-- e.g. the "Hypnotic Sound" demo) still carries those ids and so still renders the retired boxes +
-- the duplicate map. This one-shot migration removes those ids from every saved event layout so the
-- saved layouts match the current default. It keeps the ONE canonical venue map (`event-venue-map`,
-- bottom of main). There is no separate "venmo" LAYOUT block to strip: the Venmo-handle line only
-- ever rendered inside the Join box, gated by !TICKETING_ENABLED (lib/events/ticketing.ts) — with
-- ticketing ON it is already hidden, so nothing in the layout carries it.
--
-- SHAPE: page_settings.layout is jsonb `{ template, slots: { <slotId>: { order[], hidden[], roles{},
-- header?, headerEnabled? } } }` (lib/page-settings/layout.ts). We rebuild each slot, filtering the
-- retired ids out of `order` + `hidden` and dropping them as keys from `roles`, preserving every
-- other slot key (header/headerEnabled) and every untouched slot byte-for-byte.
--
-- NARROW: only rows whose route is an event page ('/events/%', which covers both the '/events/*'
-- section key and each concrete '/events/<slug>'). IDEMPOTENT: a row is only UPDATEd when the rebuilt
-- layout actually differs, so re-running is a no-op. House style: additive + fail-safe; applied to
-- production via the Supabase SQL Editor per docs/WORKFLOW.md (NOT db push).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r          record;
  targets    text[] := array['event-pricing', 'event-sales', 'event-location'];
  new_slots  jsonb;
  new_layout jsonb;
  slot_key   text;
  slot_val   jsonb;
  filtered   jsonb;
begin
  for r in
    select ctid, layout
    from public.page_settings
    where (route like '/events/%' or route = '/events/*')
      and layout is not null
      and jsonb_typeof(layout -> 'slots') = 'object'
  loop
    new_slots := '{}'::jsonb;

    for slot_key, slot_val in
      select key, value from jsonb_each(r.layout -> 'slots')
    loop
      -- Filter the retired ids out of `order` (only when the key exists, so we never add one).
      if slot_val ? 'order' then
        filtered := coalesce(
          (select jsonb_agg(e)
             from jsonb_array_elements_text(slot_val -> 'order') as e
            where e <> all(targets)),
          '[]'::jsonb
        );
        slot_val := jsonb_set(slot_val, '{order}', filtered);
      end if;

      -- Same for `hidden`.
      if slot_val ? 'hidden' then
        filtered := coalesce(
          (select jsonb_agg(e)
             from jsonb_array_elements_text(slot_val -> 'hidden') as e
            where e <> all(targets)),
          '[]'::jsonb
        );
        slot_val := jsonb_set(slot_val, '{hidden}', filtered);
      end if;

      -- Drop the retired ids as keys from the per-module `roles` map.
      if slot_val ? 'roles' then
        slot_val := jsonb_set(slot_val, '{roles}', (slot_val -> 'roles') - targets);
      end if;

      new_slots := new_slots || jsonb_build_object(slot_key, slot_val);
    end loop;

    new_layout := jsonb_set(r.layout, '{slots}', new_slots);

    -- Idempotent: only write when something actually changed.
    if new_layout is distinct from r.layout then
      update public.page_settings set layout = new_layout where ctid = r.ctid;
    end if;
  end loop;
end $$;

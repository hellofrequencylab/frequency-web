-- Shop & Marketplace rework, Phase 3 (ADR-596): backfill the JSON Space "Store" offerings
-- (spaces.preferences.profileData.offerings[]) into commerce_products as space-owned services.
--
-- ONE-SHOT + IDEMPOTENT. Additive only: it INSERTs service rows and does NOT touch the JSON
-- offerings node (that stays a legacy read for rollback safety; a later Phase 9 migration drops it).
-- Re-running is safe: the NOT EXISTS guard on (owner_space_id, lower(title), source marker) prevents
-- duplicates. commerce_products has no unique key usable here, so we guard in the WHERE, not ON CONFLICT.
--
-- Field map (SpaceOffering -> commerce_products), with the unit/enum hazards handled:
--   title            -> title (clamped 200)
--   blurb            -> description
--   price (MAJOR $)  -> price_cents (* 100, rounded)      -- a missing *100 would 100x-underprice
--   priceModel free/contact -> price_cents 0 (kept in metadata.service so the UI renders Free/Contact)
--   currency (UPPER) -> currency (lower)                  -- app rows are lowercase 'usd'
--   visibility       -> status: 'listed'/default -> 'active', 'private' -> 'draft' (set explicitly)
--   priceModel/durationMinutes/deposit(->cents)/recurring(drop 'once')/slidingScale -> metadata.service
--   packageCount + slidingScale min/max          -> metadata.legacyOffering (lossless; ServiceConfig
--                                                   has no home for these yet)
-- Fixed: owner_kind='space', product_kind='service', vertical='service',
--        entity_id = ENTITY_ID.labs (for-profit commerce partition), stock null, images '{}'.

insert into public.commerce_products
  (owner_kind, owner_space_id, owner_profile_id, entity_id, product_kind, vertical,
   title, description, price_cents, currency, stock, status, metadata)
select
  'space',
  s.id,
  null,
  '1ab50000-0000-4000-a000-000000000002',            -- ENTITY_ID.labs
  'service',
  'service',
  left(o->>'title', 200),
  nullif(o->>'blurb', ''),
  -- Numeric fields are cast only when the text is actually numeric, so a blank or malformed value
  -- (e.g. "durationMinutes":"") yields NULL instead of aborting the whole INSERT. Prod applied clean
  -- (data was well-formed); this guard makes a fresh `db reset` in any environment robust too.
  case
    when coalesce(o->>'priceModel', 'fixed') in ('free', 'contact') then 0
    when o->>'price' ~ '^[0-9]+(\.[0-9]+)?$' then round((o->>'price')::numeric * 100)::int
    else 0
  end,
  lower(coalesce(nullif(o->>'currency', ''), 'USD')),
  null,
  case when coalesce(o->>'visibility', 'listed') = 'private' then 'draft' else 'active' end,
  jsonb_build_object(
    'source', 'offering_backfill',
    'service', jsonb_strip_nulls(jsonb_build_object(
      'priceModel',   nullif(o->>'priceModel', ''),
      'durationMin',  case when o->>'durationMinutes' ~ '^[0-9]+$' then (o->>'durationMinutes')::int end,
      'depositCents', case when o->>'deposit' ~ '^[0-9]+(\.[0-9]+)?$' then round((o->>'deposit')::numeric * 100)::int end,
      'recurrence',   nullif(o->>'recurring', 'once'),
      'slidingScale', case when (o ? 'slidingScaleMin') or (o ? 'slidingScaleMax') then true end
    )),
    -- Lossless preservation of fields ServiceConfig has no home for yet (packageCount, band).
    'legacyOffering', jsonb_strip_nulls(jsonb_build_object(
      'packageCount',    case when o->>'packageCount' ~ '^[0-9]+$' then (o->>'packageCount')::int end,
      'slidingScaleMin', case when o->>'slidingScaleMin' ~ '^[0-9]+(\.[0-9]+)?$' then (o->>'slidingScaleMin')::numeric end,
      'slidingScaleMax', case when o->>'slidingScaleMax' ~ '^[0-9]+(\.[0-9]+)?$' then (o->>'slidingScaleMax')::numeric end
    ))
  )
from public.spaces s
  cross join lateral jsonb_array_elements(s.preferences->'profileData'->'offerings') as o
where jsonb_typeof(s.preferences->'profileData'->'offerings') = 'array'
  and coalesce(trim(o->>'title'), '') <> ''
  and not exists (
    select 1 from public.commerce_products cp
    where cp.owner_space_id = s.id
      and cp.metadata->>'source' = 'offering_backfill'
      and lower(cp.title) = lower(trim(o->>'title'))
  );

-- Shop & Marketplace rework, Phase 3 (ADR-593): backfill the JSON Space "Store" offerings
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
  case
    when coalesce(o->>'priceModel', 'fixed') in ('free', 'contact') then 0
    else round(coalesce((o->>'price')::numeric, 0) * 100)::int
  end,
  lower(coalesce(nullif(o->>'currency', ''), 'USD')),
  null,
  case when coalesce(o->>'visibility', 'listed') = 'private' then 'draft' else 'active' end,
  jsonb_build_object(
    'source', 'offering_backfill',
    'service', jsonb_strip_nulls(jsonb_build_object(
      'priceModel',   nullif(o->>'priceModel', ''),
      'durationMin',  (o->>'durationMinutes')::int,
      'depositCents', case when (o->>'deposit') is not null
                          then round((o->>'deposit')::numeric * 100)::int end,
      'recurrence',   nullif(o->>'recurring', 'once'),
      'slidingScale', case when (o ? 'slidingScaleMin') or (o ? 'slidingScaleMax') then true end
    )),
    -- Lossless preservation of fields ServiceConfig has no home for yet (packageCount, band).
    'legacyOffering', jsonb_strip_nulls(jsonb_build_object(
      'packageCount',    (o->>'packageCount')::int,
      'slidingScaleMin', (o->>'slidingScaleMin')::numeric,
      'slidingScaleMax', (o->>'slidingScaleMax')::numeric
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

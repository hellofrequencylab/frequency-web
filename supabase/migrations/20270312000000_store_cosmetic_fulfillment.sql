-- APPLIED to production 2026-08-18 via MCP apply_migration; ledger repaired to this version the
-- same day (name store_cosmetic_fulfillment). Post-verified: four undeliverable SKUs inactive,
-- @aidentyack's profile_flair = 'star' (the 2A make-good; his receipt metadata records it),
-- waveform-border metadata proper, fulfilled_at/fulfilled_by + partial index present, flair copy
-- describes the profile. scripts/store-shelf.json re-captured in the same change. Authored as
-- docs/proposals/LIVE-013-cosmetic-fulfillment.sql (backlog LIVE-013); path 2A (DELIVER) chosen.
--
-- The profiles write crosses prevent_economy_self_edit(), which admits only auth.role() =
-- 'service_role' — the app's sanctioned server-write path. This migration runs under that same
-- claim, set LOCAL so it dies with the transaction (and with the migration's own transaction on a
-- fresh replay).
set local request.jwt.claims = '{"role":"service_role"}';

-- ONE: take the four undeliverable SKUs off the shelf (reversible: is_active = true).
update store_items set is_active = false
where slug in ('s1-flair-set', 'animated-banner', 'callsign-plate', 'custom-title-slot');

-- TWO (2A): deliver the flair @aidentyack paid for; never clobber one he since equipped.
update profiles set profile_flair = 'star'
where id = 'b249f7a7-0044-4e1e-86cf-539d333baa98'
  and profile_flair is null;

update store_redemptions
set metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object('fulfilled', 'flair:star', 'fulfilled_note', 'LIVE-013 make-good')
where id = '450c30a2-06e8-4720-9c87-cfecaa95c03d';

-- THREE: write waveform-border's metadata properly so the data says what the code had to infer.
update store_items
set metadata = metadata || '{"type": "border", "value": "waveform"}'::jsonb
where slug = 'waveform-border';

-- FOUR: let an operator mark a perk honored.
alter table store_redemptions
  add column if not exists fulfilled_at timestamptz,
  add column if not exists fulfilled_by uuid references profiles(id) on delete set null;

comment on column store_redemptions.fulfilled_at is
  'When an operator confirmed this redemption was hand-delivered (LIVE-013). NULL = still owed. Only meaningful for feature/membership SKUs; cosmetics apply themselves at redeem time.';
comment on column store_redemptions.fulfilled_by is
  'The operator who honored it (LIVE-013). NULL alongside a NULL fulfilled_at.';

create index if not exists store_redemptions_unfulfilled_idx
  on store_redemptions (redeemed_at)
  where fulfilled_at is null;

-- FIVE: the flair copy describes what ships (profile), not what was hoped for (posts).
update store_items set description = 'A flame icon beside your name on your profile'     where slug = 'flair-fire';
update store_items set description = 'A star icon beside your name on your profile'      where slug = 'flair-star';
update store_items set description = 'A gem icon beside your name on your profile'       where slug = 'flair-gem';
update store_items set description = 'A crown icon beside your name on your profile'     where slug = 'flair-crown';
update store_items set description = 'A lightning bolt beside your name on your profile' where slug = 'flair-lightning';

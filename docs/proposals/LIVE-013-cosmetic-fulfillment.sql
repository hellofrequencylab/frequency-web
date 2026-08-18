-- ⚠️ THIS FILE LIVES OUTSIDE supabase/migrations/ ON PURPOSE.
-- A file in supabase/migrations/ asserts "production has run this". Until the owner applies it
-- that assertion is false, and check:migrations rule 4 (ADR-1007) fails on it in CI, where the
-- ledger arm is ARMED with real credentials. Sitting here it makes no claim.
--
-- TO PROMOTE, in this order:
--   1. move this file to supabase/migrations/20270312000000_store_cosmetic_fulfillment.sql
--   2. apply it
--   3. repair the ledger to 20270312000000 per supabase/migrations/README.md
--   4. re-capture scripts/store-shelf.json with its `recaptureQuery`, then DELETE the matching
--      entries from its `quarantine` array. `pnpm check:cosmetic-renders` then goes from
--      "4 quarantined" to a clean ✓, and its --probe goes 1 -> 0, which is what closes LIVE-013.
--
-- COSMETICS THE STORE SOLD AND THE PRODUCT NEVER SHOWED (backlog LIVE-013, docs/REWARDS-ECONOMY.md).
--
-- ⚠️ NOT APPLIED. Authored for the owner to apply. Applying is TWO steps — see
-- supabase/migrations/README.md (ADR-963): apply it, then repair the ledger so the row carries
-- THIS version (20270312000000) and not the timestamp `apply_migration` mints. Until it is
-- applied, `pnpm check:migrations` rule 4 will report this file as `unpairedRepo`
-- ("authored but never applied"), which is the correct reading of the tree.
--
-- ── WHAT IS BROKEN ───────────────────────────────────────────────────────────────────────────
--
-- The Vault Store charged Gems for profile cosmetics that nothing in the product rendered, and
-- routed the rest to an operator queue that did not exist. Verified against production on
-- 2026-08-17; every count below is measured, not estimated:
--
--   REDEMPTIONS, ALL TIME:  4 rows.  3 paid (950 Gems), 1 granted (0 Gems).
--   MEMBERS WHO HAVE PAID:  1  (@aidentyack, a real member, membership_tier 'crew').
--   WHEN:                   2026-06-27, all three within 15 minutes. 51 days before this file.
--
--     slug            paid    Gems   what the member was promised     what actually happened
--     ------------------------------------------------------------------------------------------
--     title-og        yes      750   Display "OG" on your profile     custom_title = 'OG' was
--                                                                     written. NOTHING read that
--                                                                     column except a text chip in
--                                                                     his own Vault.
--     guest-pass      yes      150   Bring a guest to a members-only  recorded as pending. No
--                                    event                            operator surface listed it.
--     s1-flair-set    yes       50   A set of Season 1 profile flair  metadata was '{}', so it
--                                    icons                            routed to pending too. There
--                                                                     is no "set" slot, and no
--                                                                     queue. Nothing happened.
--
-- The CODE half of the fix has shipped and needs nothing from this file: the three cosmetic
-- columns now render on the member's profile (components/profile/profile-cosmetics.tsx), the
-- redeem path REFUSES an undeliverable cosmetic before charging (lib/store/fulfillment.ts), and
-- /admin/store now lists the perks a person still owes. What remains is data, and data is yours.
--
-- ── ONE: TAKE THE FOUR UNDELIVERABLE SKUS OFF THE SHELF ──────────────────────────────────────
--
-- Each of these is `is_active` and priced, sits in a category that promises a visible profile
-- change, and resolves to nothing the product can paint. `redeemItem` already refuses them, so
-- they take no Gems today — but a member still sees them on the shelf reading "Not ready yet",
-- which is a worse shopfront than not stocking them. Deactivating is reversible: build the
-- surface, set is_active back to true, and the guard will confirm it renders.

update store_items set is_active = false
where slug in (
  's1-flair-set',      -- a SET of flair; profiles.profile_flair holds ONE value
  'animated-banner',   -- no banner slot exists on a member profile
  'callsign-plate',    -- no callsign field exists on a profile
  'custom-title-slot'  -- sells the right to AUTHOR a title; there is no editor to author one in
);

-- ── TWO: MAKE GOOD THE ONE PURCHASE THAT DELIVERED NOTHING ───────────────────────────────────
--
-- @aidentyack paid 50 Gems for `s1-flair-set` on 2026-06-27 and received nothing. Two honest
-- ways to settle it. PICK ONE — they are mutually exclusive, and 2A is the recommendation.
--
-- 2A (RECOMMENDED) — DELIVER. Give him a real Season 1 flair and keep the receipt in his
-- collection. He paid for flair; he gets flair. `star` is chosen because it is the plainest of
-- the five and reads as a Season 1 mark rather than as one of the priced flair SKUs he did not
-- buy. Swap the value for any key in BORDER_RENDERS/FLAIR_RENDERS (lib/store/cosmetics.ts) if you
-- would rather give a different one; the guard does not care which, only that it paints.

update profiles set profile_flair = 'star'
where id = 'b249f7a7-0044-4e1e-86cf-539d333baa98'   -- @aidentyack
  and profile_flair is null;                        -- never clobber a flair he has since equipped

-- Make the receipt honest too, so the collection chip and the equipped flair agree, and so a
-- future re-read of this row does not look like the same unfulfilled purchase.
update store_redemptions
set metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object('fulfilled', 'flair:star', 'fulfilled_note', 'LIVE-013 make-good')
where id = '450c30a2-06e8-4720-9c87-cfecaa95c03d';  -- the s1-flair-set redemption

-- 2B (ALTERNATIVE) — REFUND. Deleting the redemption row returns the 50 Gems: the spendable
-- balance is `lifetime_gems` minus the sum of redemptions minus gifts sent (lib/store/balance.ts),
-- and `lifetime_gems` is monotonic and untouched. `s1-flair-set` has stock = null, so nothing
-- needs restocking. ⚠️ It also erases the receipt from his collection, which is why 2A is
-- preferred. Run this INSTEAD of 2A, never as well.
--
--   delete from store_redemptions where id = '450c30a2-06e8-4720-9c87-cfecaa95c03d';

-- ── THREE: RETIRE THE CODE BRIDGE FOR waveform-border ────────────────────────────────────────
--
-- `waveform-border` is on sale with metadata that names no cosmetic type, so it fell into the
-- same hole. Its copy is unambiguous ("An animated waveform profile border"), so the code bridges
-- it (SLUG_COSMETICS in lib/store/cosmetics.ts) and it delivers TODAY. This writes the metadata
-- properly so the data says what the code had to infer; after it is applied the bridge row is
-- redundant and can be deleted in a follow-up. Behaviour is identical either way: applied
-- metadata always wins over the bridge, and the guard agrees with both.

update store_items
set metadata = metadata || '{"type": "border", "value": "waveform"}'::jsonb
where slug = 'waveform-border';

-- ── FOUR: LET AN OPERATOR MARK A PERK HONORED ────────────────────────────────────────────────
--
-- /admin/store now shows "To honor": every paid feature/membership redemption, oldest first. It
-- is READ-ONLY, because there is nowhere to record that the guest pass was actually handed over.
-- These two columns are that place. Nullable and defaulted, so every existing row keeps its exact
-- meaning ("not yet honored") and no backfill is needed.

alter table store_redemptions
  add column if not exists fulfilled_at timestamptz,
  add column if not exists fulfilled_by uuid references profiles(id) on delete set null;

comment on column store_redemptions.fulfilled_at is
  'When an operator confirmed this redemption was hand-delivered (LIVE-013). NULL = still owed. '
  'Only meaningful for feature/membership SKUs; cosmetics apply themselves at redeem time.';
comment on column store_redemptions.fulfilled_by is
  'The operator who honored it (LIVE-013). NULL alongside a NULL fulfilled_at.';

-- The queue reads oldest-unfulfilled-first, so index the open ones only. Partial: the fulfilled
-- rows grow without bound and the queue never reads them.
create index if not exists store_redemptions_unfulfilled_idx
  on store_redemptions (redeemed_at)
  where fulfilled_at is null;

-- RLS: `store_redemptions` is service-writes-only (20260615100000_store_redemptions_service_writes)
-- and the admin console reads through the service-role client, so these columns need no new policy.
-- Add nothing here — a policy that is not needed is a hole waiting for a reason.

-- ── FIVE: STOP THE COPY PROMISING A SURFACE THAT DOES NOT EXIST ──────────────────────────────
--
-- The five flair SKUs say the icon appears "next to your name in posts". It does not: flair
-- renders on the member's PROFILE (the identity band beside Founder / rank) and in their Vault.
-- Rendering it in the post stream is real work on a hot path and is not in this change, so the
-- copy should describe what ships rather than what was hoped for. Voice per docs/CONTENT-VOICE.md:
-- plain sentence, no em dash, no narrating how the member feels about it.

update store_items set description = 'A flame icon beside your name on your profile'     where slug = 'flair-fire';
update store_items set description = 'A star icon beside your name on your profile'      where slug = 'flair-star';
update store_items set description = 'A gem icon beside your name on your profile'       where slug = 'flair-gem';
update store_items set description = 'A crown icon beside your name on your profile'     where slug = 'flair-crown';
update store_items set description = 'A lightning bolt beside your name on your profile' where slug = 'flair-lightning';

-- The border copy is already accurate ("a glowing indigo border around your avatar") now that the
-- avatar actually wears it, and the four title SKUs say "Display X", which is what happens. Left
-- alone on purpose: an edit that changes nothing is an edit a reviewer has to read for nothing.

-- ── WHAT THIS FILE DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────
--
--   · It does not touch `lifetime_gems`. That column is monotonic by design (REWARDS-ECONOMY §1)
--     and the make-good above works with the ledger rather than against it.
--   · It does not deactivate `guest-pass` or the feature SKUs. Those were always meant to be
--     honored by a person, and now there is a queue that shows them. That is the fix, not delisting.
--   · It does not add a banner, callsign or member-authored title surface. Those are product,
--     they belong on the backlog as their own rows, and inventing them here with someone else's
--     Gems already spent would be the same mistake in the other direction.

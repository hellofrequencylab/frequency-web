-- A Business can reward its regulars with a loyalty card (LIVE-710, owner ruling "Business loyalty").
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- A loyalty card is a partner offer with a visit count: "the fifth visit earns a free coffee".
-- partner_offers gains visits_required (2 to 50; null = an ordinary offer). A visit is what the
-- capture path already logs: each in-person tap of the partner's plaque writes a partner_redemptions
-- row (lib/engagement/capture.ts), once per member per day on a repeatable plaque (LIVE-654). When a
-- member has visited enough times since their last claim, they claim the reward at the counter, and
-- the claim is one more partner_redemptions row against the offer with source 'loyalty'
-- (claimLoyaltyReward, service role, after its own checks). The count then starts again.
--
-- No cash moves: nothing here touches a ledger, a balance or Stripe. No policy change:
-- partner_offers and partner_redemptions are written by server actions after their own checks.
-- An index on (partner_id, profile_id) serves the per-member visit count.
--
-- Additive and idempotent. ROLLBACK:
--   alter table public.partner_offers drop column if exists visits_required;
--   drop index if exists public.partner_redemptions_partner_profile_idx;

alter table public.partner_offers
  add column if not exists visits_required smallint
  check (visits_required is null or visits_required between 2 and 50);

create index if not exists partner_redemptions_partner_profile_idx
  on public.partner_redemptions (partner_id, profile_id, redeemed_at);

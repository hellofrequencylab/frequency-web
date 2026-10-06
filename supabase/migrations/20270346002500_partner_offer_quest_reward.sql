-- A partner can sponsor a Quest with goods (LIVE-673, owner ruling 2026-09-29 "Sponsors with goods").
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- A sponsor reward is a partner offer pointed at a Quest: physical goods or a discount, redeemed in
-- person at the partner, never cash. partner_offers gains quest_id. A member earns it by finishing
-- an official Journey of that Quest (a journey_completions row), sees it on that Journey's page, and
-- redeems it by tapping the partner's plaque, which logs the partner_redemptions row against the
-- offer exactly like any plaque redemption (lib/engagement/capture.ts). Nothing pays out money, so
-- no ledger, balance or Stripe object is touched.
--
-- quest_id is nullable (an ordinary offer has none) and goes null if the Quest is deleted, so a
-- partner's offer outlives a retired season rather than vanishing with it. Indexed for the
-- per-Quest read on the Journey page and the fk-index gate. No policy change: partner_offers is
-- written by the listing action (service role) after its own ownership check.
--
-- Additive and idempotent. ROLLBACK: alter table public.partner_offers drop column if exists quest_id;

alter table public.partner_offers
  add column if not exists quest_id uuid references public.quests (id) on delete set null;

create index if not exists partner_offers_quest_id_idx on public.partner_offers (quest_id);

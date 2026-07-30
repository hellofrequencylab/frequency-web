-- The fee RECEIPT on a ticket (Phase 2 of docs/VALUE-LADDER.md, ADR-914).
--
-- THE QUESTION THIS EXISTS TO ANSWER: a host looks at a payout, sees a fee, and asks *why did you
-- charge me for that sale?* Until now `event_tickets` stored `platform_fee_cents` and nothing else, so
-- the only available answer was "the code decided". Every input to that decision — whether the buyer
-- was already the host's audience, which relationship proved it, which tier rung applied — was
-- computed at checkout and thrown away.
--
-- That was survivable while the take rate was a rounding error nobody noticed. It is not survivable
-- now: selling is free on every tier and the RATE is the entire product ladder (10% free Member → 8%
-- Crew → 5% Business → 3% Collective), and the headline promise is that a sale to someone already
-- yours is 0% forever. A promise that cannot be audited is a promise that will eventually be
-- disputed, and "trust the code" is not an answer anyone should accept about their own money.
--
-- The sibling `orders` table already carries `attribution_ref`, so this closes the gap on the busiest
-- money path rather than inventing a new idea. It also improves on it: `orders` stores the ref ONLY
-- for network-sourced sales, discarding the `own:<signal>` receipt exactly when someone wants to know
-- why a sale was free. These columns are written on every ticket, both directions.
--
-- Additive and nullable throughout. Existing rows keep NULL, which reads honestly as "sold before the
-- receipt existed" rather than as a fabricated backfill.

alter table public.event_tickets
  add column if not exists order_source   text,
  add column if not exists attribution_ref text,
  add column if not exists take_rate_bps  integer;

comment on column public.event_tickets.order_source is
  'How the sale was sourced: ''self'' (the buyer was already the seller''s audience -> 0% fee, the hard promise) or ''network'' (Frequency introduced them -> the tier rung). Set at checkout by lib/commerce/order-source.ts classifyOrderSource.';

comment on column public.event_tickets.attribution_ref is
  'WHICH signal decided order_source, so a fee can be explained to the host who paid it. ''own:follows'' | ''own:space_member'' | ''own:crm_contact'' | ''own:personal_contact'' | ''own:prior_purchase'' | ''own:self'' | ''own:degraded'' (a failed read, which fails safe to 0%) | ''ep:<id>'' | ''ref:<id>'' | ''src:<channel>''.';

comment on column public.event_tickets.take_rate_bps is
  'The rate ACTUALLY applied, in basis points (800 = 8%), recorded rather than recomputed. platform_fee_cents alone cannot be trusted to recover it: the fee floors fractional cents, so a small ticket loses the rate to rounding, and an operator changing a rate at /admin/pricing would silently rewrite the history of every past sale if the rate were derived at read time.';

-- Partial index on the disputable half. Only network-sourced tickets carry a fee worth querying, and
-- they are the minority, so this stays small while making "show me every fee charged to this host"
-- cheap. Self-sourced rows are 0% by rule and need no index to prove it.
create index if not exists idx_event_tickets_network_source
  on public.event_tickets (order_source, succeeded_at desc)
  where order_source = 'network';

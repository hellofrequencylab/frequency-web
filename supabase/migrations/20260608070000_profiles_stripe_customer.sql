-- =============================================================================
-- Stripe membership billing (P2.2) — profiles.stripe_customer_id
-- Links a profile to its Stripe customer so the billing portal (manage / cancel
-- subscription) can be opened for them. Set by the Stripe webhook on checkout.
-- Additive, non-breaking.
-- =============================================================================

alter table public.profiles add column if not exists stripe_customer_id text;

comment on column public.profiles.stripe_customer_id is
  'Stripe customer id for membership billing (P2.2). Set by the Stripe webhook on checkout.';

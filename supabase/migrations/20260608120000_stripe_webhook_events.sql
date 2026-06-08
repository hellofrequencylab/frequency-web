-- =============================================================================
-- Stripe webhook idempotency (P8 security hardening)
--
-- The webhook already verifies the signature (which carries replay protection within
-- Stripe's timestamp tolerance), but a RETRY (Stripe re-delivers until it gets a 2xx) or a
-- replay inside the tolerance window would re-run the handler. The handlers are mostly
-- idempotent already (set tier to the same value), but dedup on the event id makes it
-- exact: claim the event id first; if it's already there, ack without re-processing.
--
-- Service-role only (the webhook). RLS on with no policies = no anon/authenticated access.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id    text PRIMARY KEY,         -- Stripe's evt_… id (globally unique, stable across retries)
  type        text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stripe_webhook_events IS
  'Idempotency ledger for the Stripe membership webhook (P8) — one row per processed event id; the webhook claims it before handling.';

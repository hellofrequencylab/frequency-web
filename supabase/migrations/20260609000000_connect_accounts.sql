-- =============================================================================
-- Stripe Connect — payout account binding (Phase 1 foundation, ADR-175)
--
-- A host/partner receives money from the four payout channels (paid memberships,
-- event tickets, tips, store sales) through ONE Stripe Express connected account
-- per profile — one human = one account (one bank + one KYC), shared across every
-- channel and persona they earn through. The per-persona override
-- (profile_personas.stripe_account_id, stubbed in 20260608060000) is reserved for
-- the rare multi-legal-entity case and is NOT used by this phase.
--
-- These columns mirror the Stripe Account's capability flags. They are written
-- ONLY by the service role (lib/billing/connect.ts + the account.updated webhook),
-- never by the client — so RLS needs no new policy; the existing "read own profile"
-- policy already exposes them to the owner, and nothing else may write them.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false;

-- The webhook resolves an Account back to its profile by metadata.profile_id first,
-- falling back to this id — index it so that fallback lookup stays cheap.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_account_id_idx
  ON public.profiles (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.stripe_account_id IS
  'Stripe Connect (Express) connected-account id (acct_…) — the profile''s single payout destination across all earning channels (ADR-175). Service-role write only.';

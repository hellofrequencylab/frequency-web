-- =============================================================================
-- Persona verification audit trail (P2.7, ADR-163 System 2)
--
-- profile_personas already carries the state machine
-- (claimed → verified → active → suspended) + the money-binding columns
-- (stripe_account_id, entity_id). This adds the AUDIT half the verification flow
-- needs: who verified, when, free-text notes, and a maintained updated_at — so a
-- staff operator's verify / activate / suspend decision is recorded, not silent.
--
-- The per-persona Stripe Connect binding (stripe_account_id) stays stubbed until
-- the Connect account is configured — this migration is verification only.
-- =============================================================================

ALTER TABLE public.profile_personas
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Keep updated_at current on every write (generic, reused if other tables adopt it).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_personas_updated_at ON public.profile_personas;
CREATE TRIGGER trg_profile_personas_updated_at
  BEFORE UPDATE ON public.profile_personas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.profile_personas.verified_at IS
  'When a staff operator verified this persona (P2.7).';
COMMENT ON COLUMN public.profile_personas.verified_by IS
  'The profile (staff/admin) who verified this persona (P2.7).';

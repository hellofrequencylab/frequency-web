// Release point for a HELD (requires_verification) crew completion — verification-gated Zaps
// (ADR-418 completion). Stamping verified_at fires trg_after_crew_completion_verified, which writes
// the held Zap ledger row exactly once (on the null -> set transition). This is the SINGLE release
// path shared by every method:
//   • leader — a circle leader / community-ops approves (approveVerification).
//   • timer  — the member finished a real timed session of the required length.
//   • location — a geofenced check-in placed them at the gathering.
//   • code   — they scanned the circle's / event's QR (or NFC) code.
//
// Server-only (admin client = service_role, which the economy trigger's guard requires). Idempotent:
// only a still-held completion (verified_at is null) is released, so a second call is a safe no-op.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export type VerificationMethod = 'leader' | 'timer' | 'location' | 'code'

/**
 * Verify a held crew completion, releasing its Zaps. Pass `verifierId` for the leader method (who
 * approved); the auto-methods (timer/location/code) leave it null. Returns true when this call did
 * the release (false = already verified / not found / error). verified_at / verification_method
 * reach untyped until the generated types regenerate (ADR-246), hence the base-client handle.
 */
export async function verifyCrewCompletion(
  completionId: string,
  method: VerificationMethod,
  verifierId?: string | null,
): Promise<boolean> {
  if (!completionId) return false
  const admin: SupabaseClient = createAdminClient()
  const { data, error } = await admin
    .from('crew_completions')
    .update({
      verified_at: new Date().toISOString(),
      verification_method: method,
      ...(verifierId ? { verified_by: verifierId } : {}),
    })
    .eq('id', completionId)
    .is('verified_at', null)
    .select('id')
    .maybeSingle()
  return !error && !!data
}

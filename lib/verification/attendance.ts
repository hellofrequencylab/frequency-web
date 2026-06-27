// Verification flow: "showed up" (ADR-420). A member becomes VERIFIED the first time they
// physically check in at a real event. checkInEvent calls this after a valid check-in; it
// stamps profiles.verified_at + verification_method='attendance' ONCE (only when still null),
// so a later, stronger method is never clobbered and re-runs are free.
//
// authz-delegated: the WRITE is self-scoped by construction. checkInEvent resolves the caller
// (getMyProfileId) and passes that id here, and we only ever set THAT member's own row, gated on
// verified_at being null. No per-caller authz beyond checkInEvent's own gate is needed (it already
// validated a 'going' RSVP at a started event). Best-effort + fail-safe: never breaks the check-in.

import { createAdminClient } from '@/lib/supabase/admin'

export async function markVerifiedByAttendance(profileId: string): Promise<void> {
  if (!profileId) return
  try {
    // verified_at / verification_method reached untyped until the types regenerate (ADR-246).
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        update: (patch: Record<string, unknown>) => {
          eq: (col: string, v: string) => { is: (col: string, v: null) => Promise<{ error: unknown }> }
        }
      }
    }
    await admin
      .from('profiles')
      .update({ verified_at: new Date().toISOString(), verification_method: 'attendance' })
      .eq('id', profileId)
      .is('verified_at', null)
  } catch {
    // fail-safe: verification is a bonus, never block a check-in
  }
}

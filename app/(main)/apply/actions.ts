'use server'

// Member-facing apply actions (Growth OS Engine 3, GE3-2/GE3-3, ADR-456). A thin
// authz wrapper over lib/applications/handoff.ts: resolve the signed-in real member,
// validate the track + answers, then submit. The heavy lifting (the open-application
// guard, the engagement ledger, and the accept-side handoff) lives in the lib.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { getTrack, type ApplicationTrack } from '@/lib/applications/tracks'
import { submitApplication } from '@/lib/applications/handoff'

/** The signed-in REAL member's profile id + email. Demo profiles cannot apply
 *  (mirrors the remix guard). Returns the id/email, or a human-readable error. */
async function caller(): Promise<{ id: string; email: string | null } | string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'Please sign in to apply.'
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, is_demo, email')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = data as { id: string; is_demo?: boolean; email?: string | null } | null
  if (!me || me.is_demo) return 'Only members can apply.'
  return { id: me.id, email: me.email ?? user.email ?? null }
}

export interface ApplyInput {
  track: string
  /** The track's question keys to plain-text answers. */
  answers: Record<string, string>
  /** Optional name override for the queue (defaults to the profile's). */
  name?: string | null
}

/**
 * Submit an application for a track. Validates the track + that every REQUIRED
 * question is answered, trims/caps each answer, then records it (idempotent while
 * open). Returns the application id on success.
 */
export async function applyToTrack(input: ApplyInput): Promise<ActionResult<{ applicationId: string }>> {
  const who = await caller()
  if (typeof who === 'string') return fail(who)

  const track = getTrack(input.track)
  if (!track) return fail('Unknown application track.')

  // Validate + clean the answers against the track's questions.
  const answers: Record<string, string> = {}
  for (const q of track.questions) {
    const raw = (input.answers?.[q.key] ?? '').trim()
    if (q.required && !raw) return fail(`Please answer: ${q.label}`)
    if (raw) answers[q.key] = raw.slice(0, q.short ? 200 : 1500)
  }

  try {
    const { applicationId } = await submitApplication({
      track: track.id as ApplicationTrack,
      applicantProfileId: who.id,
      applicantEmail: who.email,
      applicantName: input.name?.trim()?.slice(0, 120) || null,
      answers,
    })
    revalidatePath(`/apply/${track.id}`)
    revalidatePath('/admin/growth/applications')
    return ok({ applicationId })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not submit the application.')
  }
}

// ============================================================================
// ADMISSION WAVES — the engine behind the Command Center's admission approvals.
// ============================================================================
//
// A wave is one batch of waitlist invites, run PHASE-BY-PHASE through the approval
// spine (lib/beta/approvals.ts). Two steps, deliberately split by authority:
//
//   1. proposeAdmissionWave(segment, phaseId, label) — a CONTENT-WRITER (writerGate)
//      drafts a wave: it records the target `segment`, files it under a phase, and
//      snapshots how many confirmed-but-not-yet-invited contacts it would admit
//      (proposed_count). It creates a DRAFT only. Nothing sends.
//
//   2. admitAdmissionWave(waveId) — an APPROVER (approverGate) runs the wave. It
//      passes through assertApproved() (the send gate REFUSES anything not
//      `approved`/`scheduled`), then flips each confirmed contact to
//      meta.beta_status='invited' and sends the invite email, and marks the wave
//      `sent`. This is Wave-2 send code, so it MUST clear assertApproved first.
//
// The target audience is the CONFIRMED, not-yet-invited beta waitlist (contacts
// source='beta_waitlist'): a double opt-in confirmed contact who has not already
// been invited. `segment` is stored as the audience label; a richer SegmentKey
// resolver can narrow this pool later without changing the spine.
//
// Server-only (service-role reaches contacts + beta_admission_waves). NOT a
// 'use server' module — the thin server-action entrypoints live in the admin
// surface, mirroring lib/beta/approvals.ts.

import { revalidatePath } from 'next/cache'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { createAdminClient } from '@/lib/supabase/admin'
import { betaDb } from './db'
import { approverGate, writerGate } from './guard'
import { assertApproved } from './approvals'
import { logBetaAction } from './audit'
import { sendBetaInviteEmail } from '@/lib/email'
import { SITE_URL } from '@/lib/site'

interface WaitlistContact {
  id: string
  email: string
  displayName: string | null
  meta: Record<string, unknown>
}

/** Is this waitlist contact CONFIRMED (double opt-in) and NOT already invited? Mirrors the status
 *  derivation in lib/studio/beta.ts: invited wins, then confirmed = subscribed OR meta.double_optin. */
function isConfirmedNotInvited(consent: string | null, meta: Record<string, unknown>): boolean {
  if (meta.beta_status === 'invited') return false
  return consent === 'subscribed' || meta.double_optin === 'confirmed'
}

/** The wave's target audience: confirmed, not-yet-invited beta waitlist contacts. Reads through the
 *  service-role client (contacts bypasses RLS); filters the confirmed-not-invited pool in JS so the meta
 *  derivation stays 1:1 with the rest of the beta surface. FAIL-SAFE to [] on a read error. */
async function confirmedNotInvited(): Promise<WaitlistContact[]> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('contacts')
      .select('id, email, display_name, consent_state, meta')
      .eq('source', 'beta_waitlist')
      .limit(5000)
    return ((data ?? []) as Record<string, unknown>[])
      .map((c) => {
        const meta = (c.meta && typeof c.meta === 'object' ? c.meta : {}) as Record<string, unknown>
        return {
          id: String(c.id),
          email: String(c.email ?? ''),
          displayName: (c.display_name as string) ?? null,
          consent: (c.consent_state as string) ?? null,
          meta,
        }
      })
      .filter((c) => c.email && isConfirmedNotInvited(c.consent, c.meta))
      .map(({ id, email, displayName, meta }) => ({ id, email, displayName, meta }))
  } catch (err) {
    console.error('[beta] confirmedNotInvited failed:', err)
    return []
  }
}

/**
 * PROPOSE a wave (writer-gated): create a DRAFT beta_admission_waves row that snapshots the target
 * segment, its phase, and how many confirmed contacts it would admit right now (proposed_count). Nothing
 * sends — the wave enters the approval spine at `draft`, to be marked ready → approved before it can run.
 * Returns the new wave id + the snapshotted count.
 */
export async function proposeAdmissionWave(
  segment: string,
  phaseId: string | null,
  label: string,
): Promise<ActionResult<{ waveId: string; proposedCount: number }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const proposedCount = (await confirmedNotInvited()).length
  const now = new Date().toISOString()
  const { data, error } = await betaDb()
    .from('beta_admission_waves')
    .insert({
      label: label.trim() || 'Untitled wave',
      segment: segment.trim(),
      phase_id: phaseId,
      proposed_count: proposedCount,
      approval_status: 'draft',
      created_by: gate.profileId,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle()

  if (error || !data?.id) return fail('Could not propose this wave.')
  const waveId = String(data.id)

  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'propose_wave',
    targetType: 'admission_wave',
    targetId: waveId,
    detail: { segment: segment.trim(), phaseId, proposedCount },
  })
  revalidatePath('/admin/beta')
  return ok({ waveId, proposedCount })
}

/**
 * ADMIT a wave (approver-gated): run an APPROVED wave. Clears the send gate first (assertApproved throws
 * unless the wave is approved/scheduled — nothing sends without approval), then for each confirmed,
 * not-yet-invited contact: flips meta.beta_status='invited' and sends the invite email (reusing
 * sendBetaInviteEmail). Per-contact failures are logged and skipped so one bad row never aborts the wave.
 * Finally marks the wave `sent` and audits the admitted count. Returns how many were admitted.
 */
export async function admitAdmissionWave(waveId: string): Promise<ActionResult<{ admitted: number }>> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)

  // THE SEND GATE. Refuses anything not approved/scheduled. Fail-closed by design.
  try {
    await assertApproved({ type: 'admission_wave', id: waveId })
  } catch {
    return fail('This wave is not approved. Nothing sends without approval.')
  }

  const db = createAdminClient()
  const signupUrl = `${SITE_URL.replace(/\/$/, '')}/sign-in`
  const targets = await confirmedNotInvited()

  let admitted = 0
  for (const c of targets) {
    const now = new Date().toISOString()
    const meta = { ...c.meta, beta_status: 'invited', invited_at: now }
    const { error } = await db
      .from('contacts')
      .update({ meta, updated_at: now })
      .eq('id', c.id)
    if (error) {
      console.error('[beta] admit: could not flip contact', c.id, error)
      continue
    }
    admitted++
    try {
      await sendBetaInviteEmail({ to: c.email, signupUrl, displayName: c.displayName })
    } catch (err) {
      // The admission stands even if the email fails to queue; it can be re-sent from the beta table.
      console.error('[beta] admit: invite email failed to queue for', c.email, err)
    }
  }

  // Close the wave out on the spine (sent, terminal). Best-effort; the admissions already landed.
  const closedAt = new Date().toISOString()
  await betaDb()
    .from('beta_admission_waves')
    .update({ approval_status: 'sent', sent_at: closedAt, updated_at: closedAt })
    .eq('id', waveId)

  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'admit_wave',
    targetType: 'admission_wave',
    targetId: waveId,
    detail: { admitted, targeted: targets.length },
  })
  revalidatePath('/admin/beta')
  revalidatePath('/admin/marketing/beta')
  return ok({ admitted })
}

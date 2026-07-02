// Application submit + the accept handoff (Growth OS Engine 3, GE3-2/GE3-3,
// ADR-456). Server-only (admin client; the action layer enforces authz). This is the
// heart of Engine 3:
//   * submitApplication — record a member's application for a track, exactly once
//     while it is open (the migration's partial unique index is the hard backstop).
//   * decideApplication — a reviewer accepts or declines. On ACCEPT of the host
//     track, grant the host role and hand off a Starter Circle by REUSING the
//     existing remix lifecycle (ensureHostOnOwnership + remixTemplate), so there is
//     ONE host-promotion + draft-handoff code path, not a parallel one. The handoff
//     is recorded on the application row so re-running accept is a no-op.
//
// The applications + waitlist tables are not in the generated DB types until regen,
// so writes go through an untyped admin handle (the funnels/circles convention,
// ADR-246).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { ensureHostOnOwnership, remixTemplate } from '@/lib/circles/remix'
import { getActiveTemplates } from '@/lib/circles/templates-data'
import {
  getTrack,
  OPEN_STATUSES,
  type ApplicationTrack,
} from './tracks'
import { getApplication, type Application, type ApplicationHandoff } from './store'

function db(): SupabaseClient {
  return createAdminClient()
}

export interface SubmitApplicationInput {
  track: ApplicationTrack
  applicantProfileId: string
  applicantEmail?: string | null
  applicantName?: string | null
  answers: Record<string, unknown>
}

export interface SubmitResult {
  applicationId: string
  /** false when the member already had an open application on this track (no-op). */
  created: boolean
}

/**
 * Record a member's application for a track. Idempotent while open: if the member
 * already has a pending/in_review application on this track, returns it unchanged
 * (the migration's partial unique index is the hard backstop against a race).
 * Best-effort emits an `application.submitted` engagement event on first insert.
 */
export async function submitApplication(input: SubmitApplicationInput): Promise<SubmitResult> {
  const track = getTrack(input.track)
  if (!track) throw new Error('Unknown application track.')

  const admin = db()

  // An open application already? Return it (the apply surface shows "in review").
  const { data: existing } = await admin
    .from('applications')
    .select('id')
    .eq('applicant_profile_id', input.applicantProfileId)
    .eq('track', input.track)
    .in('status', OPEN_STATUSES)
    .maybeSingle()
  if (existing) return { applicationId: String((existing as { id: string }).id), created: false }

  const { data, error } = await admin
    .from('applications')
    .insert({
      track: input.track,
      applicant_profile_id: input.applicantProfileId,
      applicant_email: input.applicantEmail?.trim() || null,
      applicant_name: input.applicantName?.trim() || null,
      answers: input.answers ?? {},
      status: 'pending',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error('Could not submit the application.')
  const applicationId = String((data as { id: string }).id)

  // Reward + analytics ledger, best-effort (never block the submit).
  try {
    await recordEngagementEvent({
      idempotencyKey: `application_submit:${applicationId}`,
      source: 'web',
      eventType: 'application.submitted',
      actorProfileId: input.applicantProfileId,
      context: { applicationId, track: input.track },
    })
  } catch {
    /* ledger is best-effort */
  }

  return { applicationId, created: true }
}

export interface DecideInput {
  applicationId: string
  reviewerProfileId: string
  /** Accept of the host track grants host + hands off this Starter Circle. Optional;
   *  when omitted on a host accept, the first active Starter Circle is used. */
  starterTemplateId?: string | null
  /** A one-line note shown on the decision trail (required on decline; optional accept). */
  reason?: string | null
}

export interface DecideResult {
  status: 'accepted' | 'declined'
  handoff: ApplicationHandoff | null
}

/**
 * Accept or decline an application. ACCEPT of the host track runs the handoff:
 * grant the host role (ensureHostOnOwnership) and hand off a Starter Circle draft
 * (remixTemplate) the new host owns and finishes. The handoff is recorded on the
 * row, so a re-run reads the existing handoff and does not double-create a circle.
 * The reviewer is recorded on the decision trail.
 *
 * Authz is the CALLER's job (the action re-checks the members/marketing capability);
 * this is the system effect once a reviewer has decided.
 */
export async function decideApplication(input: DecideInput, accept: boolean): Promise<DecideResult> {
  const app = await getApplication(input.applicationId)
  if (!app) throw new Error('Application not found.')

  // Idempotent: a decided application returns its recorded outcome, never re-handoffs.
  if (app.status === 'accepted') return { status: 'accepted', handoff: app.handoff }
  if (app.status === 'declined') return { status: 'declined', handoff: null }

  const admin = db()
  const now = new Date().toISOString()

  if (!accept) {
    await admin
      .from('applications')
      .update({
        status: 'declined',
        reviewed_by: input.reviewerProfileId,
        decided_at: now,
        decision_reason: input.reason?.trim()?.slice(0, 500) || null,
      })
      .eq('id', app.id)
    try {
      await recordEngagementEvent({
        idempotencyKey: `application_declined:${app.id}`,
        source: 'system',
        eventType: 'application.declined',
        actorProfileId: app.applicantProfileId,
        context: { applicationId: app.id, track: app.track },
      })
    } catch {
      /* ledger best-effort */
    }
    return { status: 'declined', handoff: null }
  }

  // ── Accept ──────────────────────────────────────────────────────────────────
  // Claim-then-effect (data integrity): stamp `accepted` BEFORE creating the Starter Circle,
  // conditioned on the row still carrying its pre-decision status, and abort if the claim fails
  // or is lost. Previously the handoff ran first and the status write's error was never checked —
  // so a silently-failed update left status at `in_review`, and a re-accept re-ran runAcceptHandoff,
  // minting a DUPLICATE Starter Circle. The conditional claim also makes concurrent accepts safe.
  const { data: claimed, error: claimErr } = await admin
    .from('applications')
    .update({
      status: 'accepted',
      reviewed_by: input.reviewerProfileId,
      decided_at: now,
      decision_reason: input.reason?.trim()?.slice(0, 500) || null,
    })
    .eq('id', app.id)
    .eq('status', app.status)
    .select('id')
    .maybeSingle()
  if (claimErr) throw new Error('Could not record the decision. No Circle was created.')
  if (!claimed) {
    // Another accept won the claim (or the row moved on): do NOT create a second Circle.
    const fresh = await getApplication(app.id)
    return { status: 'accepted', handoff: fresh?.handoff ?? null }
  }

  const handoff = await runAcceptHandoff(app, input.starterTemplateId ?? null)

  // Record the handoff detail on the already-claimed row. Best-effort: the claim above is the
  // idempotency guard, so a failure here can never cause a duplicate Circle on a later re-accept.
  await admin
    .from('applications')
    .update({ handoff: (handoff as unknown) ?? null })
    .eq('id', app.id)

  try {
    await recordEngagementEvent({
      idempotencyKey: `application_accepted:${app.id}`,
      source: 'system',
      eventType: 'application.accepted',
      actorProfileId: app.applicantProfileId,
      context: { applicationId: app.id, track: app.track, handoff: (handoff as unknown) ?? null },
    })
  } catch {
    /* ledger best-effort */
  }

  return { status: 'accepted', handoff }
}

/**
 * The accept-side handoff. For the HOST track (and only when the applicant is a real
 * profile): grant host + hand off a Starter Circle by reusing remixTemplate, which
 * itself calls ensureHostOnOwnership. For an operator track, grant nothing yet (the
 * Space provisioning is GE10) and return a record noting the accept. Best-effort: a
 * handoff failure must not wedge the decision, so it is caught and the accept still
 * lands (the operator can re-run, which reads the recorded handoff).
 */
async function runAcceptHandoff(
  app: Application,
  starterTemplateId: string | null,
): Promise<ApplicationHandoff | null> {
  const track = getTrack(app.track)
  if (!track || !app.applicantProfileId) {
    // An anon-email application has no profile to promote; accept records nothing.
    return null
  }

  if (!track.grantsHost) {
    // Operator tracks: promote nothing today (Space provisioning is GE10). Record the
    // accept so the row carries an auditable handoff stub.
    return { role: 'operator_pending' }
  }

  try {
    // Pick the Starter Circle: the chosen template, else the first active one.
    let templateId = starterTemplateId
    if (!templateId) {
      const templates = await getActiveTemplates()
      templateId = templates[0]?.id ?? null
    }

    if (templateId) {
      // remixTemplate grants host (ensureHostOnOwnership) AND hands off a draft Circle.
      const { circleId, slug } = await remixTemplate({
        templateId,
        profileId: app.applicantProfileId,
      })
      return { circleId, circleSlug: slug, role: 'host', starterTemplateId: templateId }
    }

    // No Starter Circle available: still grant the host role so the Leadership tab opens.
    await ensureHostOnOwnership(app.applicantProfileId)
    return { role: 'host' }
  } catch {
    // The handoff is best-effort. Fall back to the role grant alone; if even that
    // fails, the accept still records with a null handoff and can be re-run.
    try {
      await ensureHostOnOwnership(app.applicantProfileId)
      return { role: 'host' }
    } catch {
      return null
    }
  }
}

/** Move an application into review (a reviewer claimed it). Idempotent; only acts on
 *  a pending row. */
export async function markInReview(applicationId: string, reviewerProfileId: string): Promise<void> {
  await db()
    .from('applications')
    .update({ status: 'in_review', reviewed_by: reviewerProfileId })
    .eq('id', applicationId)
    .eq('status', 'pending')
}

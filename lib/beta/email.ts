// ============================================================================
// Beta Command Center — Wave 2 EMAIL data layer. Reads + writes for the section
// that actually SENDS, so it is the strictest consumer of the approval spine.
// ============================================================================
//
// GOVERNING RULE (server-enforced): NOTHING SENDS WITHOUT APPROVAL. The one real
// send path here (sendApprovedBetaCampaign) calls assertApproved(ref) FIRST and
// refuses anything not `approved`/`scheduled`. A test send is exempt (it is not the
// real send) and records itself via recordTestSend. Everything the compose/seed code
// writes is a DRAFT (approval_status 'draft').
//
// WHAT A "BETA" OBJECT IS:
//   • A beta CAMPAIGN is a `campaigns` row filed under a Beta phase (phase_id NOT
//     null) — it rides the SAME approval spine as any campaign, so the Today queue,
//     armPhase, and audit trail all already see it.
//   • A beta FUNNEL is a time-based `nurture_sequences` (+ its `nurture_steps`) or an
//     event-based `automation_rules` row, scoped to Beta by a naming convention
//     (BETA_FUNNEL_PERSONA_PREFIX / BETA_RULE_NAME_PREFIX). Funnels have no
//     approval_status column; their arm-once-then-pausable gate IS the `enabled`
//     flag, flipped ONLY by an approver (armFunnel/pauseFunnel).
//
// Server-only. Reads go through the untyped betaDb() handle (campaigns' new approval
// columns + the nurture/automation tables aren't in the generated types yet, ADR-246).
// The send loop reuses the studio machinery verbatim (resolveSegment, campaignEmail,
// the unified send-gate). NOT a 'use server' module — the thin action entrypoints live
// in app/(main)/admin/beta/email-actions.ts.

import { revalidatePath } from 'next/cache'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { betaDb } from './db'
import { approverGate, writerGate } from './guard'
import { logBetaAction } from './audit'
import { assertApproved } from './approvals'
import { resolveSegment, campaignEmail, type SegmentKey } from '@/lib/studio/campaigns'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'
import type { ApprovalStatus } from './approvals'

// ── Beta scoping conventions (no new columns; a naming marker keeps it migration-free) ──

/** A nurture sequence is a Beta funnel when its persona starts with this. */
export const BETA_FUNNEL_PERSONA_PREFIX = 'beta_'
/** An automation rule is a Beta funnel when its name starts with this. */
export const BETA_RULE_NAME_PREFIX = 'Beta:'

// ── Beta campaigns ───────────────────────────────────────────────────────────

export interface BetaCampaign {
  id: string
  subject: string
  body: string
  segment: string
  /** Legacy campaigns.status (draft|sent). The spine below is approval_status. */
  legacyStatus: string
  approvalStatus: ApprovalStatus
  phaseId: string | null
  recipientCount: number
  testSentAt: string | null
  scheduledFor: string | null
  sentAt: string | null
  createdAt: string | null
}

const BETA_CAMPAIGN_COLS =
  'id, subject, body, segment, status, approval_status, phase_id, recipient_count, test_sent_at, scheduled_for, sent_at, created_at'

function mapBetaCampaign(r: Record<string, unknown>): BetaCampaign {
  return {
    id: String(r.id),
    subject: String(r.subject ?? 'Untitled campaign'),
    body: String(r.body ?? ''),
    segment: String(r.segment ?? ''),
    legacyStatus: String(r.status ?? 'draft'),
    approvalStatus: (r.approval_status as ApprovalStatus) ?? 'draft',
    phaseId: (r.phase_id as string) ?? null,
    recipientCount: r.recipient_count == null ? 0 : Number(r.recipient_count),
    testSentAt: (r.test_sent_at as string) ?? null,
    scheduledFor: (r.scheduled_for as string) ?? null,
    sentAt: (r.sent_at as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
  }
}

/** Every campaign filed under a Beta phase, newest first. FAIL-SAFE to []. */
export async function listBetaCampaigns(): Promise<BetaCampaign[]> {
  try {
    const { data } = await betaDb()
      .from('campaigns')
      .select(BETA_CAMPAIGN_COLS)
      .order('created_at', { ascending: false })
      .limit(200)
    // betaDb() has no `.not()`; filter the beta-owned rows (phase_id set) in JS.
    return (data ?? []).map(mapBetaCampaign).filter((c) => c.phaseId !== null)
  } catch (err) {
    console.error('[beta] listBetaCampaigns failed:', err)
    return []
  }
}

/** One beta campaign by id, or null. */
export async function getBetaCampaign(id: string): Promise<BetaCampaign | null> {
  try {
    const { data } = await betaDb().from('campaigns').select(BETA_CAMPAIGN_COLS).eq('id', id).maybeSingle()
    return data ? mapBetaCampaign(data) : null
  } catch (err) {
    console.error('[beta] getBetaCampaign failed:', err)
    return null
  }
}

export interface ComposeCampaignInput {
  subject: string
  body: string
  segment: SegmentKey
  phaseId: string
}

/**
 * Create a beta campaign DRAFT (approval_status 'draft', filed under a phase).
 * Content-writer gated: drafting is not sending. Returns the new id. Lints the body
 * for the ONE hard rule (no em dashes) so a violation never enters as a draft.
 */
export async function createBetaCampaign(input: ComposeCampaignInput): Promise<ActionResult<{ id: string }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const subject = input.subject.trim()
  const body = input.body.trim()
  if (!subject || !body) return fail('Give the campaign a subject and a body.')
  if (!input.phaseId) return fail('Pick the Beta phase this campaign belongs to.')
  const lint = lintVoice(`${subject}\n${body}`)
  if (lint.hasEmDash) return fail('Remove the em dashes before saving. Use a period, comma, or parentheses.')

  const { data, error } = await betaDb()
    .from('campaigns')
    .insert({
      subject: subject.slice(0, 200),
      body: body.slice(0, 8000),
      segment: input.segment,
      status: 'draft',
      approval_status: 'draft',
      phase_id: input.phaseId,
      created_by: gate.profileId,
    })
    .select('id')
    .maybeSingle()
  if (error || !data?.id) return fail('Could not save the campaign.')

  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'compose_campaign',
    targetType: 'campaign',
    targetId: String(data.id),
    detail: { subject: subject.slice(0, 200), segment: input.segment, phaseId: input.phaseId },
  })
  revalidatePath('/admin/beta')
  return ok({ id: String(data.id) })
}

/**
 * Edit a drafted/ready beta campaign's content. Content-writer gated. Refuses once
 * the campaign has left the pre-approval states (approved/scheduled/sending/sent):
 * you cannot silently rewrite what was already armed.
 */
export async function updateBetaCampaign(
  id: string,
  input: { subject: string; body: string; segment: SegmentKey },
): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const current = await getBetaCampaign(id)
  if (!current) return fail('That campaign no longer exists.')
  if (current.approvalStatus !== 'draft' && current.approvalStatus !== 'ready') {
    return fail('This campaign is past editing. Pause it back to draft to change the copy.')
  }
  const subject = input.subject.trim()
  const body = input.body.trim()
  if (!subject || !body) return fail('Subject and body are required.')
  const lint = lintVoice(`${subject}\n${body}`)
  if (lint.hasEmDash) return fail('Remove the em dashes before saving. Use a period, comma, or parentheses.')

  const { error } = await betaDb()
    .from('campaigns')
    .update({
      subject: subject.slice(0, 200),
      body: body.slice(0, 8000),
      segment: input.segment,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return fail('Could not save the campaign.')
  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'edit_campaign',
    targetType: 'campaign',
    targetId: id,
    detail: { subject: subject.slice(0, 200), segment: input.segment },
  })
  revalidatePath('/admin/beta')
  return ok()
}

// ── The recipient preview (pre-approval count) ───────────────────────────────

/** How many contacts a segment resolves to, before per-recipient consent at send.
 *  Writer-gated (it is a read of the audience an operator is about to target). */
export async function previewBetaSegment(segment: SegmentKey): Promise<ActionResult<{ count: number }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  try {
    const recipients = await resolveSegment(segment)
    return ok({ count: recipients.length })
  } catch {
    return fail('Could not resolve that audience.')
  }
}

// ── THE SEND PATH (assertApproved is the FIRST thing it does) ─────────────────

/**
 * Send an APPROVED beta campaign to its segment. THE GATE: assertApproved() runs
 * first and THROWS unless approval_status is approved|scheduled, so a draft/ready
 * campaign can never send even if the client asks. After the gate clears, this reuses
 * the exact studio send machinery (resolveSegment + campaignEmail + the unified
 * send-gate + enqueueEmail), sending against the EXISTING drafted row rather than
 * minting a second one the way sendCampaign() would. On completion it stamps
 * recipient_count / sent_at and moves the row to `sent`, and writes an audit row.
 */
export async function sendApprovedBetaCampaign(id: string): Promise<ActionResult<{ recipientCount: number }>> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)

  // THE GOVERNING RULE, enforced server-side. Re-reads the row; throws unless sendable.
  await assertApproved({ type: 'campaign', id })

  const campaign = await getBetaCampaign(id)
  if (!campaign) return fail('That campaign no longer exists.')
  if (campaign.sentAt) return fail('This campaign has already been sent.')

  const subject = campaign.subject.trim()
  const body = campaign.body.trim()
  if (!subject || !body) return fail('The campaign has no subject or body to send.')

  // Mark in-flight so a double click cannot re-enter the loop.
  await betaDb()
    .from('campaigns')
    .update({ approval_status: 'sending', status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', id)

  let count = 0
  try {
    const recipients = await resolveSegment(campaign.segment)
    for (const r of recipients) {
      // The ONE unified send-gate (suppression + consent + preference) — the same seam
      // sendCampaign and the automations engine ride. Marketing rides the lifecycle category.
      const decision = await resolveSendGate(r.profileId, 'email', 'lifecycle', { email: r.email })
      if (!decision.allowed) continue
      const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: SITE_URL, profileId: r.profileId, category: 'lifecycle' })
      const { html, text } = campaignEmail(body, unsubscribeUrl)
      // Tag the campaign id for EXACT analytics attribution (parity with the studio send path):
      // a Resend header + tag that the webhook reads back into email_events.campaign_id.
      await enqueueEmail({
        to: r.email,
        subject,
        html,
        text,
        headers: { ...listUnsubscribeHeaders(unsubscribeUrl), 'X-Campaign-Id': id },
        tags: [{ name: 'campaign_id', value: id }],
      })
      count++
    }
  } catch (err) {
    console.error('[beta] sendApprovedBetaCampaign send loop failed:', err)
    return fail('The send did not complete. No status was changed to sent.')
  }

  await betaDb()
    .from('campaigns')
    .update({
      approval_status: 'sent',
      status: 'sent',
      recipient_count: count,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'send_campaign',
    targetType: 'campaign',
    targetId: id,
    detail: { recipientCount: count, segment: campaign.segment },
  })
  revalidatePath('/admin/beta')
  return ok({ recipientCount: count })
}

/**
 * TEST send: deliver ONE copy of the campaign to the signed-in operator's own email.
 * A test is NOT the real send, so it is content-writer gated, skips assertApproved,
 * touches no recipients, and records itself with recordTestSend (test_sent_at) so the
 * lifecycle UI can show "tested". Never clears the approval gate.
 */
export async function sendBetaTestEmail(id: string): Promise<ActionResult<{ to: string }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const campaign = await getBetaCampaign(id)
  if (!campaign) return fail('That campaign no longer exists.')
  const subject = campaign.subject.trim()
  const body = campaign.body.trim()
  if (!subject || !body) return fail('Add a subject and body before test-sending.')

  // The operator's own contact email.
  const { data: contact } = await betaDb()
    .from('contacts')
    .select('email')
    .eq('profile_id', gate.profileId)
    .maybeSingle()
  const to = (contact?.email as string) ?? null
  if (!to) return fail('We could not find an email on your account to send the test to.')

  const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: SITE_URL, profileId: gate.profileId, category: 'lifecycle' })
  const { html, text } = campaignEmail(body, unsubscribeUrl)
  await enqueueEmail({
    to,
    subject: `[Test] ${subject}`,
    html,
    text,
    headers: listUnsubscribeHeaders(unsubscribeUrl),
  })

  await betaDb().from('campaigns').update({ test_sent_at: new Date().toISOString() }).eq('id', id)
  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'test_send_campaign',
    targetType: 'campaign',
    targetId: id,
    detail: { to },
  })
  revalidatePath('/admin/beta')
  return ok({ to })
}

// ── Beta funnels (time-based nurture + event-based automations) ───────────────

export type FunnelKind = 'nurture' | 'automation'

export interface BetaFunnelStep {
  order: number
  delayHours: number
  subject: string
  enabled: boolean
}

export interface BetaFunnel {
  kind: FunnelKind
  id: string
  name: string
  /** The plain-language trigger: "when they join the waitlist", or an event name. */
  trigger: string
  enabled: boolean
  /** nurture only: the timed steps (empty for automations). */
  steps: BetaFunnelStep[]
}

/** Beta drip funnels (nurture) + event triggers (automations), scoped to Beta. FAIL-SAFE to []. */
export async function listBetaFunnels(): Promise<BetaFunnel[]> {
  const out: BetaFunnel[] = []
  try {
    const { data: seqs } = await betaDb()
      .from('nurture_sequences')
      .select('id, persona, name, enabled')
      .order('created_at', { ascending: true })
    const betaSeqs = (seqs ?? []).filter((s) =>
      String((s as Record<string, unknown>).persona ?? '').startsWith(BETA_FUNNEL_PERSONA_PREFIX),
    )
    const ids = betaSeqs.map((s) => String((s as Record<string, unknown>).id))
    const stepsBySeq = new Map<string, BetaFunnelStep[]>()
    if (ids.length) {
      const { data: steps } = await betaDb()
        .from('nurture_steps')
        .select('sequence_id, step_order, delay_hours, subject, enabled')
        .in('sequence_id', ids)
      for (const s of steps ?? []) {
        const row = s as Record<string, unknown>
        const key = String(row.sequence_id)
        const list = stepsBySeq.get(key) ?? []
        list.push({
          order: Number(row.step_order ?? 0),
          delayHours: Number(row.delay_hours ?? 0),
          subject: String(row.subject ?? ''),
          enabled: Boolean(row.enabled),
        })
        stepsBySeq.set(key, list)
      }
    }
    for (const s of betaSeqs) {
      const row = s as Record<string, unknown>
      out.push({
        kind: 'nurture',
        id: String(row.id),
        name: String(row.name ?? 'Beta funnel'),
        trigger: 'When someone joins the Beta waitlist',
        enabled: Boolean(row.enabled),
        steps: (stepsBySeq.get(String(row.id)) ?? []).sort((a, b) => a.order - b.order),
      })
    }
  } catch (err) {
    console.error('[beta] listBetaFunnels (nurture) failed:', err)
  }

  try {
    const { data: rules } = await betaDb()
      .from('automation_rules')
      .select('id, name, trigger_event, enabled')
      .order('created_at', { ascending: true })
    for (const r of rules ?? []) {
      const row = r as Record<string, unknown>
      const name = String(row.name ?? '')
      if (!name.startsWith(BETA_RULE_NAME_PREFIX)) continue
      out.push({
        kind: 'automation',
        id: String(row.id),
        name,
        trigger: `On event: ${String(row.trigger_event ?? 'unknown')}`,
        enabled: Boolean(row.enabled),
        steps: [],
      })
    }
  } catch (err) {
    console.error('[beta] listBetaFunnels (automations) failed:', err)
  }

  return out
}

const FUNNEL_TABLE: Record<FunnelKind, string> = {
  nurture: 'nurture_sequences',
  automation: 'automation_rules',
}

/**
 * ARM a funnel: flip `enabled` true. This is the send-authorizing act for a funnel
 * (a live funnel emails on its own), so it is APPROVER-gated and audited, mirroring
 * approve() for campaigns. A funnel ships DISABLED and only an approver may arm it.
 */
export async function armFunnel(kind: FunnelKind, id: string): Promise<ActionResult> {
  return setFunnelEnabled(kind, id, true, 'arm_funnel')
}

/** PAUSE / kill switch: flip `enabled` back off. Approver-gated + audited. */
export async function pauseFunnel(kind: FunnelKind, id: string): Promise<ActionResult> {
  return setFunnelEnabled(kind, id, false, 'pause_funnel')
}

async function setFunnelEnabled(
  kind: FunnelKind,
  id: string,
  enabled: boolean,
  action: 'arm_funnel' | 'pause_funnel',
): Promise<ActionResult> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const { error } = await betaDb().from(FUNNEL_TABLE[kind]).update({ enabled }).eq('id', id)
  if (error) return fail(enabled ? 'Could not arm the funnel.' : 'Could not pause the funnel.')
  await logBetaAction({
    actorProfileId: gate.profileId,
    action,
    targetType: kind === 'nurture' ? 'nurture_sequence' : 'automation_rule',
    targetId: id,
    detail: { enabled },
  })
  revalidatePath('/admin/beta')
  return ok()
}

// ── Voice lint (pure) — the guard the Ready transition runs before an item ships ──

export interface VoiceViolation {
  /** A short machine key for the rule. */
  rule: string
  /** A one-line, operator-facing explanation. */
  detail: string
}

export interface VoiceLintResult {
  violations: VoiceViolation[]
  /** The ONE hard rule. When true, an item may not be marked Ready. */
  hasEmDash: boolean
}

// Vibe-verbs / hype words from the voice primer (lib/ai/voice.ts §banned). A curated,
// high-signal subset — the lint flags them as warnings; the em dash is the hard block.
const BANNED_PHRASES = [
  'tap into',
  'drop into',
  'sink into',
  'lean into',
  'tune into yourself',
  'hold space',
  'ride the wave',
  'let it flow',
  'align with',
  'unlock',
  'elevate',
  'transform your life',
  'level up',
  'supercharge',
  'optimize',
  'tribe',
  'fam',
  'dive in',
  'game changer',
  'game-changer',
]

/**
 * Lint copy against the hard, mechanical parts of the Frequency voice (docs/
 * CONTENT-VOICE.md §10.8): NO em/en dashes (hard block), no vibe-verb/hype phrases,
 * at most one exclamation point. Pure + unit-tested. This is NOT the whole canon (a
 * human still reads for voice); it is the machine-checkable floor the Ready gate runs.
 */
export function lintVoice(text: string): VoiceLintResult {
  const violations: VoiceViolation[] = []
  const hasEmDash = /[—–]/.test(text)
  if (hasEmDash) {
    violations.push({
      rule: 'em-dash',
      detail: 'Contains an em or en dash. Use a period, comma, or parentheses instead.',
    })
  }
  const lower = text.toLowerCase()
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      violations.push({ rule: 'banned-phrase', detail: `Banned phrase: "${phrase}". Say it plainly instead.` })
    }
  }
  const exclamations = (text.match(/!/g) ?? []).length
  if (exclamations > 1) {
    violations.push({
      rule: 'exclamation',
      detail: `Uses ${exclamations} exclamation points. Keep it to one at most, usually zero.`,
    })
  }
  return { violations, hasEmDash }
}

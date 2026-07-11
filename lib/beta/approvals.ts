// ============================================================================
// THE APPROVAL SPINE (Beta Command Center Wave 1). The single seam every
// outbound object passes through before it can send.
// ============================================================================
//
// GOVERNING RULE (owner directive, non-negotiable): NOTHING SENDS WITHOUT
// EXPLICIT APPROVAL. Automation only ever prepares DRAFTS. The send path REFUSES
// anything not `approved` (or `scheduled`).
//
// ── HOW WAVE-2 SEND CODE MUST USE THIS ──
// Before ANY real send (sendCampaign, admit a wave, fire a beta sequence), call:
//
//     import { assertApproved } from '@/lib/beta/approvals'
//     await assertApproved({ type: 'campaign', id })        // throws unless sendable
//     // ...only now enqueue / admit ...
//
// `assertApproved` re-reads the row server-side and THROWS unless its
// approval_status is `approved` or `scheduled`. It is the ONLY sanctioned way to
// clear the gate; do not read approval_status and branch by hand. A test send is
// exempt (it is not the real send) — record it with `recordTestSend` instead.
//
// ── APPROVAL IS PHASE-BY-PHASE ──
// The operator reviews + edits a phase's drafted outbound, then ARMS it. Every
// approvable object carries a nullable `phase_id`. Use:
//   • listPhaseOutbound(phaseId) — the phase's campaigns + waves (+ sequences,
//     Wave 2) with their approval_status, for the phase review/arm UI.
//   • armPhase(phaseId) — approve EVERY `ready` item in the phase at once (each
//     still writing its own audit row). Convenience over per-item approve().
//   • approve({ type, id }) — arm ONE item, for granular control.
// The Today "Needs approval" queue groups the `ready` items BY PHASE
// (listReadyForApproval → groupReadyByPhase).
//
// ── WHO MAY ARM ──
// Every transition here (markReady / approve / pause / cancel / armPhase) runs
// the APPROVER gate: ADMIN or JANITOR web_role only (approverGate). recordTestSend
// is content-writer gated (a test is not a send). Each transition writes a
// beta_audit_log row and returns an ActionResult. Server-only.
// Each transition writes a beta_audit_log row and returns an ActionResult.
// Server-only, but NOT a 'use server' module (it exports consts/types/pure
// helpers too). The thin server-action entrypoints that call these transitions
// live in app/(main)/admin/beta/actions.ts.
// ============================================================================

import { revalidatePath } from 'next/cache'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { betaDb } from './db'
import { approverGate, writerGate } from './guard'
import { logBetaAction } from './audit'

// ── The shared approval vocabulary (mirrors the migration's text+check). ──
export const APPROVAL_STATUSES = [
  'draft',
  'ready',
  'approved',
  'scheduled',
  'sending',
  'sent',
  'paused',
  'cancelled',
] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

/** The states that CLEAR the send gate. The whole rule, in one place. */
export const SENDABLE_STATUSES: readonly ApprovalStatus[] = ['approved', 'scheduled']

/** Pure predicate: may an object in this status send? */
export function isSendable(status: string | null | undefined): boolean {
  return status === 'approved' || status === 'scheduled'
}

// ── The approvable object types + their tables. Add a row here to put a new
//    outbound object on the spine (Wave 2: beta sequences / funnels). ──
export type ApprovableType = 'campaign' | 'admission_wave'

const TABLE: Record<ApprovableType, string> = {
  campaign: 'campaigns',
  admission_wave: 'beta_admission_waves',
}

/** audit target_type is 1:1 with ApprovableType. */
const AUDIT_TARGET: Record<ApprovableType, 'campaign' | 'admission_wave'> = {
  campaign: 'campaign',
  admission_wave: 'admission_wave',
}

export interface ApprovableRef {
  type: ApprovableType
  id: string
}

export interface OutboundItem {
  type: ApprovableType
  id: string
  label: string
  approvalStatus: ApprovalStatus
  phaseId: string | null
  /** Wave: the audience selector. Campaign: the segment. */
  segment: string | null
  /** Wave: proposed_count. Campaign: recipient_count. */
  count: number | null
  scheduledFor: string | null
  createdAt: string | null
}

// ── The read seam ──────────────────────────────────────────────────────────

async function readApprovalStatus(ref: ApprovableRef): Promise<string | null> {
  const { data } = await betaDb()
    .from(TABLE[ref.type])
    .select('approval_status')
    .eq('id', ref.id)
    .maybeSingle()
  return (data?.approval_status as string) ?? null
}

/**
 * THE SEND GATE. Throws unless the target row is `approved` or `scheduled`. This
 * is the single sanctioned pre-send check every Wave-2 send path MUST call. Re-reads
 * server-side so a stale client can never smuggle a draft past it. Fail-closed:
 * a missing row or read error throws.
 */
export async function assertApproved(ref: ApprovableRef): Promise<void> {
  const status = await readApprovalStatus(ref)
  if (!isSendable(status)) {
    throw new Error(
      `Refused: ${ref.type} ${ref.id} is not approved (status ${status ?? 'unknown'}). Nothing sends without approval.`,
    )
  }
}

// ── Row → OutboundItem mappers (the two tables differ in shape). ─────────────

function mapCampaign(r: Record<string, unknown>): OutboundItem {
  return {
    type: 'campaign',
    id: String(r.id),
    label: String(r.subject ?? 'Untitled campaign'),
    approvalStatus: (r.approval_status as ApprovalStatus) ?? 'draft',
    phaseId: (r.phase_id as string) ?? null,
    segment: (r.segment as string) ?? null,
    count: r.recipient_count == null ? null : Number(r.recipient_count),
    scheduledFor: (r.scheduled_for as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
  }
}

function mapWave(r: Record<string, unknown>): OutboundItem {
  return {
    type: 'admission_wave',
    id: String(r.id),
    label: String(r.label ?? 'Untitled wave'),
    approvalStatus: (r.approval_status as ApprovalStatus) ?? 'draft',
    phaseId: (r.phase_id as string) ?? null,
    segment: (r.segment as string) ?? null,
    count: r.proposed_count == null ? null : Number(r.proposed_count),
    scheduledFor: (r.scheduled_for as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
  }
}

const CAMPAIGN_COLS =
  'id, subject, approval_status, phase_id, segment, recipient_count, scheduled_for, created_at'
const WAVE_COLS =
  'id, label, approval_status, phase_id, segment, proposed_count, scheduled_for, created_at'

/** Every outbound object (campaigns + waves) in a given approval status. FAIL-SAFE to []. */
export async function listOutboundByStatus(status: ApprovalStatus): Promise<OutboundItem[]> {
  try {
    const db = betaDb()
    const [c, w] = await Promise.all([
      db.from('campaigns').select(CAMPAIGN_COLS).eq('approval_status', status).order('created_at', { ascending: false }),
      db.from('beta_admission_waves').select(WAVE_COLS).eq('approval_status', status).order('created_at', { ascending: false }),
    ])
    return [...(c.data ?? []).map(mapCampaign), ...(w.data ?? []).map(mapWave)]
  } catch (err) {
    console.error('[beta] listOutboundByStatus failed:', err)
    return []
  }
}

/** The Today "Needs approval" queue: everything currently `ready`. FAIL-SAFE to []. */
export async function listReadyForApproval(): Promise<OutboundItem[]> {
  return listOutboundByStatus('ready')
}

/** All outbound owned by ONE phase, any status (the phase review/arm view). FAIL-SAFE to []. */
export async function listPhaseOutbound(phaseId: string): Promise<OutboundItem[]> {
  try {
    const db = betaDb()
    const [c, w] = await Promise.all([
      db.from('campaigns').select(CAMPAIGN_COLS).eq('phase_id', phaseId).order('created_at', { ascending: false }),
      db.from('beta_admission_waves').select(WAVE_COLS).eq('phase_id', phaseId).order('created_at', { ascending: false }),
    ])
    return [...(c.data ?? []).map(mapCampaign), ...(w.data ?? []).map(mapWave)]
  } catch (err) {
    console.error('[beta] listPhaseOutbound failed:', err)
    return []
  }
}

/** Group a flat item list by phase_id (null → the 'unfiled' bucket key). Pure. */
export function groupReadyByPhase(items: OutboundItem[]): Map<string | null, OutboundItem[]> {
  const out = new Map<string | null, OutboundItem[]>()
  for (const item of items) {
    const key = item.phaseId ?? null
    const bucket = out.get(key) ?? []
    bucket.push(item)
    out.set(key, bucket)
  }
  return out
}

// ── The transitions (each APPROVER-gated + audited). ─────────────────────────

/** draft → ready. The operator marks a draft finished and up for review. */
export async function markReady(ref: ApprovableRef): Promise<ActionResult> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const from = await readApprovalStatus(ref)
  const { error } = await betaDb()
    .from(TABLE[ref.type])
    .update({ approval_status: 'ready', updated_at: new Date().toISOString() })
    .eq('id', ref.id)
  if (error) return fail('Could not mark this ready.')
  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'mark_ready',
    targetType: AUDIT_TARGET[ref.type],
    targetId: ref.id,
    detail: { from, to: 'ready' },
  })
  revalidatePath('/admin/beta')
  return ok()
}

/**
 * ARM one item: ready → approved (or → scheduled when `scheduledFor` is given).
 * Stamps approved_by / approved_at (and scheduled_for). This is the send-authorizing
 * act — after it, assertApproved() clears and Wave-2 code may send.
 */
export async function approve(
  ref: ApprovableRef,
  opts: { scheduledFor?: string } = {},
): Promise<ActionResult> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const from = await readApprovalStatus(ref)
  const scheduled = Boolean(opts.scheduledFor)
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    approval_status: scheduled ? 'scheduled' : 'approved',
    approved_by: gate.profileId,
    approved_at: now,
    updated_at: now,
  }
  if (scheduled) patch.scheduled_for = opts.scheduledFor
  const { error } = await betaDb().from(TABLE[ref.type]).update(patch).eq('id', ref.id)
  if (error) return fail('Could not approve this.')
  await logBetaAction({
    actorProfileId: gate.profileId,
    action: scheduled ? 'schedule' : 'approve',
    targetType: AUDIT_TARGET[ref.type],
    targetId: ref.id,
    detail: { from, to: scheduled ? 'scheduled' : 'approved', scheduledFor: opts.scheduledFor ?? null },
  })
  revalidatePath('/admin/beta')
  return ok()
}

/** Halt an item (→ paused). Reversible: an operator can markReady/approve it again. */
export async function pause(ref: ApprovableRef): Promise<ActionResult> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const from = await readApprovalStatus(ref)
  const { error } = await betaDb()
    .from(TABLE[ref.type])
    .update({ approval_status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', ref.id)
  if (error) return fail('Could not pause this.')
  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'pause',
    targetType: AUDIT_TARGET[ref.type],
    targetId: ref.id,
    detail: { from, to: 'paused' },
  })
  revalidatePath('/admin/beta')
  return ok()
}

/** Kill an item (→ cancelled, terminal). */
export async function cancel(ref: ApprovableRef): Promise<ActionResult> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const from = await readApprovalStatus(ref)
  const { error } = await betaDb()
    .from(TABLE[ref.type])
    .update({ approval_status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', ref.id)
  if (error) return fail('Could not cancel this.')
  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'cancel',
    targetType: AUDIT_TARGET[ref.type],
    targetId: ref.id,
    detail: { from, to: 'cancelled' },
  })
  revalidatePath('/admin/beta')
  return ok()
}

/**
 * Record a TEST send (campaigns only; waves have no test). Sets test_sent_at. A
 * test is not the real send, so this is content-writer gated, does not touch
 * approval_status, and never clears assertApproved().
 */
export async function recordTestSend(ref: ApprovableRef): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  if (ref.type !== 'campaign') return fail('Only a campaign can record a test send.')
  const { error } = await betaDb()
    .from('campaigns')
    .update({ test_sent_at: new Date().toISOString() })
    .eq('id', ref.id)
  if (error) return fail('Could not record the test send.')
  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'record_test_send',
    targetType: 'campaign',
    targetId: ref.id,
    detail: {},
  })
  revalidatePath('/admin/beta')
  return ok()
}

/**
 * ARM A WHOLE PHASE: approve every `ready` item in the phase at once. Each item
 * still transitions through approve() semantics and writes its own audit row,
 * plus one summary 'arm_phase' row. Granular control stays available via
 * per-item approve(). Returns the count approved.
 */
export async function armPhase(phaseId: string): Promise<ActionResult<{ approved: number }>> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)

  const items = (await listPhaseOutbound(phaseId)).filter((i) => i.approvalStatus === 'ready')
  if (items.length === 0) return ok({ approved: 0 })

  const db = betaDb()
  const now = new Date().toISOString()
  let approved = 0
  for (const item of items) {
    const { error } = await db
      .from(TABLE[item.type])
      .update({ approval_status: 'approved', approved_by: gate.profileId, approved_at: now, updated_at: now })
      .eq('id', item.id)
    if (error) continue
    approved++
    await logBetaAction({
      actorProfileId: gate.profileId,
      action: 'approve',
      targetType: AUDIT_TARGET[item.type],
      targetId: item.id,
      detail: { from: 'ready', to: 'approved', viaArmPhase: true, phaseId },
    })
  }

  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'arm_phase',
    targetType: 'phase',
    targetId: phaseId,
    detail: { approved, total: items.length },
  })
  revalidatePath('/admin/beta')
  return ok({ approved })
}

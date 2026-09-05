// ============================================================================
// THE APPROVAL SPINE. The single seam every outbound object passes through
// before it can send.
// ============================================================================
//
// GOVERNING RULE (owner directive, non-negotiable): NOTHING SENDS WITHOUT
// EXPLICIT APPROVAL. Automation only ever prepares DRAFTS. The send path REFUSES
// anything not `approved` (or `scheduled`).
//
// ── HOW A SEND PATH MUST USE THIS ──
// Before ANY real send, call:
//
//     import { assertApproved } from '@/lib/outbound/approvals'
//     await assertApproved({ type: 'campaign', id })        // throws unless sendable
//     // ...only now enqueue ...
//
// `assertApproved` re-reads the row server-side and THROWS unless its
// approval_status is `approved` or `scheduled`. It is the ONLY sanctioned way to
// clear the gate; do not read approval_status and branch by hand. Today its one
// caller is sendCampaignNow (lib/email-studio/send.ts). A test send is exempt (it
// is not the real send, it goes to the operator's own address) — record it with
// `recordTestSend` instead.
//
// ── THE TWO GATES ──
// Every transition here (markReady / approve / pause / cancel / armPhase) runs
// the APPROVER gate: ADMIN or JANITOR web_role only (approverGate, lib/outbound/
// guard.ts). recordTestSend is content-writer gated (a test is not a send). Each
// transition writes ONE beta_audit_log row (see audit.ts for why the table keeps
// that name) and returns an ActionResult.
//
// ── WHY `phase_id` IS STILL HERE ──
// The Beta Command Center that grouped outbound into launch PHASES is gone, and
// so is the `beta_phases` table. What survives is the nullable `campaigns.phase_id`
// column and the rows that already carry one: those rows still route through
// assertApproved at send time, so listPhaseOutbound / groupReadyByPhase / armPhase
// remain the way an operator can still review and arm them. A new campaign is
// filed with a null phase and simply never enters that bucket.
//
// Server-only, but NOT a 'use server' module (it exports consts/types/pure
// helpers too). A caller that needs a server action wraps these in its own
// 'use server' entrypoint.
// ============================================================================

import { revalidatePath } from 'next/cache'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { outboundDb } from './db'
import { approverGate, writerGate } from './guard'
import { logOutboundAction } from './audit'

/** The live console that lists campaigns, revalidated after every transition. The Beta
 *  Command Center used to be the surface these arms were pulled from; it is gone, and
 *  /admin/crm/marketing is where an operator sees a campaign's status today. */
const CAMPAIGN_CONSOLE = '/admin/crm/marketing'

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
//    outbound object on the spine (a sequence, a funnel). ──
//
// 'admission_wave' used to be the second member here, backed by beta_admission_waves:
// the engine that admitted people off the beta waitlist in batches. The waitlist is
// gone, so there is nothing to admit and the type was removed with it. The spine
// itself is unchanged and still governs every campaign send.
export type ApprovableType = 'campaign'

const TABLE: Record<ApprovableType, string> = {
  campaign: 'campaigns',
}

/** audit target_type is 1:1 with ApprovableType. */
const AUDIT_TARGET: Record<ApprovableType, 'campaign'> = {
  campaign: 'campaign',
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
  /** The campaign's segment. */
  segment: string | null
  /** The campaign's recipient_count. */
  count: number | null
  scheduledFor: string | null
  createdAt: string | null
}

// ── The read seam ──────────────────────────────────────────────────────────

async function readApprovalStatus(ref: ApprovableRef): Promise<string | null> {
  const { data } = await outboundDb()
    .from(TABLE[ref.type])
    .select('approval_status')
    .eq('id', ref.id)
    .maybeSingle()
  return (data?.approval_status as string) ?? null
}

/**
 * THE SEND GATE. Throws unless the target row is `approved` or `scheduled`. This
 * is the single sanctioned pre-send check every send path MUST call. Re-reads
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

// ── Row → OutboundItem mapper. ───────────────────────────────────────────────

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

const CAMPAIGN_COLS =
  'id, subject, approval_status, phase_id, segment, recipient_count, scheduled_for, created_at'

/** Every outbound object in a given approval status. FAIL-SAFE to []. */
export async function listOutboundByStatus(status: ApprovalStatus): Promise<OutboundItem[]> {
  try {
    const { data } = await outboundDb()
      .from('campaigns')
      .select(CAMPAIGN_COLS)
      .eq('approval_status', status)
      .order('created_at', { ascending: false })
    return (data ?? []).map(mapCampaign)
  } catch (err) {
    console.error('[outbound] listOutboundByStatus failed:', err)
    return []
  }
}

/** The "Needs approval" queue: everything currently `ready`. FAIL-SAFE to []. */
export async function listReadyForApproval(): Promise<OutboundItem[]> {
  return listOutboundByStatus('ready')
}

/** All outbound owned by ONE phase, any status (the phase review/arm view). FAIL-SAFE to []. */
export async function listPhaseOutbound(phaseId: string): Promise<OutboundItem[]> {
  try {
    const { data } = await outboundDb()
      .from('campaigns')
      .select(CAMPAIGN_COLS)
      .eq('phase_id', phaseId)
      .order('created_at', { ascending: false })
    return (data ?? []).map(mapCampaign)
  } catch (err) {
    console.error('[outbound] listPhaseOutbound failed:', err)
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
  const { error } = await outboundDb()
    .from(TABLE[ref.type])
    .update({ approval_status: 'ready' })
    .eq('id', ref.id)
  if (error) return fail('Could not mark this ready.')
  await logOutboundAction({
    actorProfileId: gate.profileId,
    action: 'mark_ready',
    targetType: AUDIT_TARGET[ref.type],
    targetId: ref.id,
    detail: { from, to: 'ready' },
  })
  revalidatePath(CAMPAIGN_CONSOLE)
  return ok()
}

/**
 * ARM one item: ready → approved (or → scheduled when `scheduledFor` is given).
 * Stamps approved_by / approved_at (and scheduled_for). This is the send-authorizing
 * act — after it, assertApproved() clears and the send path may send.
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
  }
  if (scheduled) patch.scheduled_for = opts.scheduledFor
  const { error } = await outboundDb().from(TABLE[ref.type]).update(patch).eq('id', ref.id)
  if (error) return fail('Could not approve this.')
  await logOutboundAction({
    actorProfileId: gate.profileId,
    action: scheduled ? 'schedule' : 'approve',
    targetType: AUDIT_TARGET[ref.type],
    targetId: ref.id,
    detail: { from, to: scheduled ? 'scheduled' : 'approved', scheduledFor: opts.scheduledFor ?? null },
  })
  revalidatePath(CAMPAIGN_CONSOLE)
  return ok()
}

/** Halt an item (→ paused). Reversible: an operator can markReady/approve it again. */
export async function pause(ref: ApprovableRef): Promise<ActionResult> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const from = await readApprovalStatus(ref)
  const { error } = await outboundDb()
    .from(TABLE[ref.type])
    .update({ approval_status: 'paused' })
    .eq('id', ref.id)
  if (error) return fail('Could not pause this.')
  await logOutboundAction({
    actorProfileId: gate.profileId,
    action: 'pause',
    targetType: AUDIT_TARGET[ref.type],
    targetId: ref.id,
    detail: { from, to: 'paused' },
  })
  revalidatePath(CAMPAIGN_CONSOLE)
  return ok()
}

/** Kill an item (→ cancelled, terminal). */
export async function cancel(ref: ApprovableRef): Promise<ActionResult> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const from = await readApprovalStatus(ref)
  const { error } = await outboundDb()
    .from(TABLE[ref.type])
    .update({ approval_status: 'cancelled' })
    .eq('id', ref.id)
  if (error) return fail('Could not cancel this.')
  await logOutboundAction({
    actorProfileId: gate.profileId,
    action: 'cancel',
    targetType: AUDIT_TARGET[ref.type],
    targetId: ref.id,
    detail: { from, to: 'cancelled' },
  })
  revalidatePath(CAMPAIGN_CONSOLE)
  return ok()
}

/**
 * Record a TEST send. Sets test_sent_at. A
 * test is not the real send, so this is content-writer gated, does not touch
 * approval_status, and never clears assertApproved().
 */
export async function recordTestSend(ref: ApprovableRef): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  if (ref.type !== 'campaign') return fail('Only a campaign can record a test send.')
  const { error } = await outboundDb()
    .from('campaigns')
    .update({ test_sent_at: new Date().toISOString() })
    .eq('id', ref.id)
  if (error) return fail('Could not record the test send.')
  await logOutboundAction({
    actorProfileId: gate.profileId,
    action: 'record_test_send',
    targetType: 'campaign',
    targetId: ref.id,
    detail: {},
  })
  revalidatePath(CAMPAIGN_CONSOLE)
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

  const db = outboundDb()
  const now = new Date().toISOString()
  let approved = 0
  for (const item of items) {
    const { error } = await db
      .from(TABLE[item.type])
      .update({ approval_status: 'approved', approved_by: gate.profileId, approved_at: now })
      .eq('id', item.id)
    if (error) continue
    approved++
    await logOutboundAction({
      actorProfileId: gate.profileId,
      action: 'approve',
      targetType: AUDIT_TARGET[item.type],
      targetId: item.id,
      detail: { from: 'ready', to: 'approved', viaArmPhase: true, phaseId },
    })
  }

  await logOutboundAction({
    actorProfileId: gate.profileId,
    action: 'arm_phase',
    targetType: 'phase',
    targetId: phaseId,
    detail: { approved, total: items.length },
  })
  revalidatePath(CAMPAIGN_CONSOLE)
  return ok({ approved })
}

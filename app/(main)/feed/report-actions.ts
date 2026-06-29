'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { logAdminAction } from '@/lib/admin/audit'
import { type ActionResult, ok, fail, isError } from '@/lib/action-result'
import { atLeastRole } from '@/lib/core/roles'
import { cancelAudit } from '@/lib/events/event-lifecycle'

type TargetType = 'post' | 'dispatch' | 'comment' | 'member' | 'event'
type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other'

// Runtime allowlists (site-audit SEC-4): the TS unions are compile-time only, so a forged
// client could pass any string. Validate before any DB write.
const VALID_TARGETS: readonly TargetType[] = ['post', 'dispatch', 'comment', 'member', 'event']
const VALID_REASONS: readonly ReportReason[] = ['spam', 'harassment', 'inappropriate', 'misinformation', 'other']
const MAX_REPORT_DETAILS = 2000

// Role-ladder comparison — single source in lib/core/roles.
const hasRole = atLeastRole

// A moderation action must act on the SAME target the report names (site-audit SEC-3): a host
// passing an unrelated id alongside an open report id must not be able to warn/suspend/cancel an
// arbitrary target. Returns true only when the report exists and its target matches.
async function reportTargetMatches(
  admin: ReturnType<typeof createAdminClient>,
  reportId: string,
  type: TargetType,
  id: string,
): Promise<boolean> {
  const { data } = await admin
    .from('reports')
    .select('target_type, target_id')
    .eq('id', reportId)
    .maybeSingle()
  return !!data && (data as { target_type: string }).target_type === type && (data as { target_id: string }).target_id === id
}

// ── Report content ──────────────────────────────────────────────────────────

export async function reportContent(
  targetType: TargetType,
  targetId: string,
  reason: ReportReason,
  details?: string
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Not authenticated')

  // Validate the target/reason at runtime (SEC-4) before any write.
  if (!VALID_TARGETS.includes(targetType)) return fail('Invalid report target')
  if (!VALID_REASONS.includes(reason)) return fail('Invalid report reason')
  if (!targetId?.trim()) return fail('Missing report target')

  const admin = createAdminClient()

  // Prevent duplicate reports from the same user on the same target
  const { data: existing } = await admin
    .from('reports')
    .select('id')
    .eq('reporter_id', caller.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return fail('You have already reported this content')
  }

  const { error } = await admin.from('reports').insert({
    reporter_id: caller.id,
    target_type: targetType,
    target_id: targetId,
    reason,
    details: details?.trim().slice(0, MAX_REPORT_DETAILS) || null,
  })

  if (error) {
    console.error('[reportContent]', error.message)
    return fail('Failed to submit report')
  }

  return ok()
}

// ── Review a report (host+ only) ───────────────────────────────────────────
//
// Action semantics by target_type:
//   post/comment → soft-hide (sets hidden_at, hidden_by — recoverable)
//   dispatch     → soft-hide
//   member       → use warnMember() or suspendMember() instead; this call
//                  on a member target is a no-op apart from status flip
//                  (kept for backwards compatibility — UI no longer calls
//                  reviewReport() on member targets, it calls the dedicated
//                  helpers below).
//   event        → use cancelEventFromReport() instead; same caveat.
//
// 'dismissed' just flips status; no content action.

export async function reviewReport(
  reportId: string,
  action: 'actioned' | 'dismissed'
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) {
    return fail('Unauthorized')
  }

  const admin = createAdminClient()
  let hidden: { targetType: string; targetId: string } | null = null

  if (action === 'actioned') {
    const { data: report } = await admin
      .from('reports')
      .select('target_type, target_id')
      .eq('id', reportId)
      .maybeSingle()

    if (report) {
      const hidePayload = {
        hidden_at: new Date().toISOString(),
        hidden_by: caller.id,
      }
      if (report.target_type === 'post' || report.target_type === 'comment') {
        await admin.from('posts').update(hidePayload).eq('id', report.target_id)
        hidden = { targetType: report.target_type, targetId: report.target_id }
      } else if (report.target_type === 'dispatch') {
        await admin.from('dispatches').update(hidePayload).eq('id', report.target_id)
        hidden = { targetType: report.target_type, targetId: report.target_id }
      }
      // member/event handled via dedicated helpers; reviewReport just closes them.
    }
  }

  const result = await closeReport(reportId, caller.id, action)
  if (!isError(result)) {
    // Audit the moderation decision (P8). Best-effort.
    await logAdminAction({
      actorId: caller.id,
      action: action === 'actioned' ? 'moderation.hide' : 'moderation.dismiss',
      targetType: hidden?.targetType ?? 'report',
      targetId: hidden?.targetId ?? reportId,
      detail: { reportId },
    })
  }
  return result
}


// ── Member-targeted actions ────────────────────────────────────────────────

const DEFAULT_WARN_TEMPLATE = (reason: string | null) =>
  `Hi. A moderator has reviewed a recent report concerning your activity ` +
  `on Frequency${reason ? ` (${reason})` : ''}. ` +
  `Please review our community guidelines. Continued issues may lead to a ` +
  `suspension. If you think this was a mistake, reply to this message and a ` +
  `moderator will follow up.`

export async function warnMember(
  reportId: string,
  memberProfileId: string,
  reason?: string,
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) {
    return fail('Unauthorized')
  }

  const admin = createAdminClient()

  // The report must actually name this member (SEC-3).
  if (!(await reportTargetMatches(admin, reportId, 'member', memberProfileId))) {
    return fail('This report does not target that member')
  }

  // Look up the system profile (Vera — formerly @moderation; one is_system row).
  // Matched by is_system, NOT the handle, so renaming the account never breaks this.
  const { data: system } = await admin
    .from('profiles')
    .select('id')
    .eq('is_system', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!system) {
    return fail('System profile missing. Re-run migration 20240207.')
  }

  // Reuse an existing 1:1 DM between the system profile and the member
  // if one already exists; otherwise spin up a new conversation.
  const { data: existingConv } = await admin
    .from('conversation_participants')
    .select('conversation_id')
    .eq('profile_id', system.id)

  let conversationId: string | null = null
  if (existingConv && existingConv.length > 0) {
    const convIds = existingConv.map((c: { conversation_id: string }) => c.conversation_id)
    const { data: shared } = await admin
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', memberProfileId)
      .in('conversation_id', convIds)
      .limit(1)
      .maybeSingle()
    conversationId = (shared as { conversation_id: string } | null)?.conversation_id ?? null
  }

  if (!conversationId) {
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .insert({})
      .select('id')
      .single()
    if (convErr || !conv) {
      console.error('[warnMember] conversation create:', convErr?.message)
      return fail('Could not open warning conversation')
    }
    conversationId = conv.id

    const { error: partErr } = await admin
      .from('conversation_participants')
      .insert([
        { conversation_id: conversationId, profile_id: system.id },
        { conversation_id: conversationId, profile_id: memberProfileId },
      ])
    if (partErr) {
      console.error('[warnMember] participants:', partErr.message)
      return fail('Could not add conversation participants')
    }
  }

  const { error: msgErr } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id:       system.id,
      body:            DEFAULT_WARN_TEMPLATE(reason ?? null),
    })
  if (msgErr) {
    console.error('[warnMember] message:', msgErr.message)
    return fail('Could not send warning message')
  }

  const result = await closeReport(reportId, caller.id, 'actioned')
  if (!isError(result)) {
    await logAdminAction({ actorId: caller.id, action: 'moderation.warn', targetType: 'member', targetId: memberProfileId, detail: { reportId, reason: reason ?? null } })
  }
  return result
}

export async function suspendMember(
  reportId: string,
  memberProfileId: string,
  options: { reason?: string; durationDays?: number } = {},
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) {
    return fail('Unauthorized')
  }

  const admin = createAdminClient()

  // The report must actually name this member (SEC-3).
  if (!(await reportTargetMatches(admin, reportId, 'member', memberProfileId))) {
    return fail('This report does not target that member')
  }

  const suspendedUntil = options.durationDays
    ? new Date(Date.now() + options.durationDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { error } = await admin
    .from('profiles')
    .update({
      suspended_at:     new Date().toISOString(),
      suspended_until:  suspendedUntil,
      suspended_reason: options.reason ?? null,
      suspended_by:     caller.id,
    })
    .eq('id', memberProfileId)

  if (error) {
    console.error('[suspendMember]', error.message)
    return fail('Failed to suspend member')
  }

  const result = await closeReport(reportId, caller.id, 'actioned')
  if (!isError(result)) {
    await logAdminAction({ actorId: caller.id, action: 'moderation.suspend', targetType: 'member', targetId: memberProfileId, detail: { reportId, reason: options.reason ?? null, durationDays: options.durationDays ?? null } })
  }
  return result
}


// ── Event-targeted actions ─────────────────────────────────────────────────

export async function cancelEventFromReport(
  reportId: string,
  eventId: string,
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) {
    return fail('Unauthorized')
  }

  const admin = createAdminClient()

  // The report must actually name this event (SEC-3).
  if (!(await reportTargetMatches(admin, reportId, 'event', eventId))) {
    return fail('This report does not target that event')
  }

  const { error } = await admin
    .from('events')
    .update(cancelAudit(caller.id, null))
    .eq('id', eventId)

  if (error) {
    console.error('[cancelEventFromReport]', error.message)
    return fail('Failed to cancel event')
  }

  const result = await closeReport(reportId, caller.id, 'actioned')
  if (!isError(result)) {
    await logAdminAction({ actorId: caller.id, action: 'moderation.event_cancel', targetType: 'event', targetId: eventId, detail: { reportId } })
  }
  return result
}


// ── Internal: close a report row + revalidate paths ────────────────────────

async function closeReport(
  reportId: string,
  callerId: string,
  status: 'actioned' | 'dismissed',
): Promise<ActionResult> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('reports')
    .update({
      status,
      reviewed_by: callerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  if (error) {
    console.error('[closeReport]', error.message)
    return fail('Failed to update report')
  }

  revalidatePath('/admin/moderation')
  revalidatePath('/feed')
  revalidatePath('/broadcast')
  return ok()
}

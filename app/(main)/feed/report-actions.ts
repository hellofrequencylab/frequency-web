'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { atLeastRole } from '@/lib/core/roles'

type TargetType = 'post' | 'dispatch' | 'comment' | 'member' | 'event'
type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other'
type ReportStatus = 'pending' | 'reviewed' | 'actioned' | 'dismissed'

// Role-ladder comparison — single source in lib/core/roles.
const hasRole = atLeastRole

// ── Report content ──────────────────────────────────────────────────────────

export async function reportContent(
  targetType: TargetType,
  targetId: string,
  reason: ReportReason,
  details?: string
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Not authenticated')

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
    details: details?.trim() || null,
  })

  if (error) {
    console.error('[reportContent]', error.message)
    return fail('Failed to submit report')
  }

  return ok()
}

// ── Get reports (host+ only) ────────────────────────────────────────────────

export type ReportRow = {
  id: string
  target_type: TargetType
  target_id: string
  reason: ReportReason
  details: string | null
  status: ReportStatus
  created_at: string
  reporter: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  }
}

export async function getReports(): Promise<ReportRow[]> {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('reports')
    .select(
      `id, target_type, target_id, reason, details, status, created_at,
       reporter:profiles!reporter_id ( id, display_name, handle, avatar_url )`
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[getReports]', error.message)
    return []
  }

  return (data ?? []) as unknown as ReportRow[]
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
      } else if (report.target_type === 'dispatch') {
        await admin.from('dispatches').update(hidePayload).eq('id', report.target_id)
      }
      // member/event handled via dedicated helpers; reviewReport just closes them.
    }
  }

  return closeReport(reportId, caller.id, action)
}


// ── Member-targeted actions ────────────────────────────────────────────────

const DEFAULT_WARN_TEMPLATE = (reason: string | null) =>
  `Hi — a moderator has reviewed a recent report concerning your activity ` +
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

  // Look up the system profile (one row, seeded by 20240207 migration).
  const { data: system } = await admin
    .from('profiles')
    .select('id')
    .eq('is_system', true)
    .eq('handle', 'moderation')
    .maybeSingle()

  if (!system) {
    return fail('System moderation profile missing — re-run migration 20240207.')
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

  return closeReport(reportId, caller.id, 'actioned')
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

  return closeReport(reportId, caller.id, 'actioned')
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
  const { error } = await admin
    .from('events')
    .update({ is_cancelled: true })
    .eq('id', eventId)

  if (error) {
    console.error('[cancelEventFromReport]', error.message)
    return fail('Failed to cancel event')
  }

  return closeReport(reportId, caller.id, 'actioned')
}


// ── Member context: prior report count ─────────────────────────────────────

export async function getMemberReportCount(memberProfileId: string): Promise<number> {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) return 0

  const admin = createAdminClient()
  const { count } = await admin
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('target_type', 'member')
    .eq('target_id', memberProfileId)

  return count ?? 0
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

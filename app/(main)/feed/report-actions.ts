'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { logAdminAction } from '@/lib/admin/audit'
import { type ActionResult, ok, fail, isError } from '@/lib/action-result'
import { atLeastRole, asWebRole } from '@/lib/core/roles'
import { getStaffMember } from '@/lib/staff'
import { staffCan } from '@/lib/core/staff-roles'
import { canModeratePlatform, canModeratePost } from '@/lib/moderation/scope'
import { cancelAudit } from '@/lib/events/event-lifecycle'

export type ReportTargetType = 'post' | 'dispatch' | 'comment' | 'member' | 'event' | 'guestbook'
type TargetType = ReportTargetType
type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other'

// Runtime allowlists (site-audit SEC-4): the TS unions are compile-time only, so a forged
// client could pass any string. Validate before any DB write. The list mirrors the schema's
// reports_target_type_check; 'guestbook' (a spotlight_guestbook note) joined in ADR-1279.
const VALID_TARGETS: readonly TargetType[] = ['post', 'dispatch', 'comment', 'member', 'event', 'guestbook']
const VALID_REASONS: readonly ReportReason[] = ['spam', 'harassment', 'inappropriate', 'misinformation', 'other']
const MAX_REPORT_DETAILS = 2000

// Role-ladder comparison — single source in lib/core/roles.
const hasRole = atLeastRole

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// WHO MAY ACT ON A REPORT (SCAN-679). Two scopes, decided here and nowhere else:
//
//   platform  — platform staff or a granted Platform moderator (profiles.web_role, ADR-208 /
//               OWN-054), or a team_members staff role holding the community domain at write
//               (the same arm requireAdmin('host', { staff: 'community' }) admits). May act on any
//               report of any kind.
//   in-Circle — a community host+. `host` is SELF-GRANTED (publishing a Circle runs
//               ensureHostOnOwnership, lib/circles/remix.ts), so it is not a platform credential.
//               A host may hide, or dismiss a report on, a post or comment INSIDE a Circle they
//               host, exactly as the `posts` policies the admin client skips would allow
//               (lib/moderation/scope.ts canModeratePost). Nothing else: no warn, no suspend, no
//               event cancel, no dispatch or guestbook hide.
//
// Before this split resolveModerator returned the caller on host alone, and every action below
// wrote through the admin client (RLS bypassed): any member who published one Circle could suspend
// any member, hide any post and cancel any event.
type Moderator = {
  caller: NonNullable<Awaited<ReturnType<typeof getCallerProfile>>>
  /** May act platform-wide. */
  platform: boolean
}

async function resolveModerator(): Promise<Moderator | null> {
  const caller = await getCallerProfile()
  if (!caller) return null
  if (canModeratePlatform(caller.webRole)) return { caller, platform: true }
  const staff = await getStaffMember().catch(() => null)
  if (staffCan(staff?.role, 'community', 'write')) return { caller, platform: true }
  // The in-Circle arm: a host+ on the community ladder. Which reports they may touch is decided
  // per report by canActOnReport; this only says they are allowed into the gate at all.
  if (hasRole(caller.community_role, 'host')) return { caller, platform: false }
  return null
}

type ReportRow = {
  reporter_id: string
  target_type: string
  target_id: string
}

// One keyed read of the report the action names. Every action below reads the row through this
// so the scope check (canActOnReport) and the target check (reportTargetMatches) see the same row.
async function loadReport(
  admin: ReturnType<typeof createAdminClient>,
  reportId: string,
): Promise<ReportRow | null> {
  if (!UUID_RE.test(reportId)) return null
  const { data } = await admin
    .from('reports')
    .select('reporter_id, target_type, target_id')
    .eq('id', reportId)
    .maybeSingle()
  return (data as ReportRow | null) ?? null
}

// The ids of the circles this profile hosts (`circles.host_id = profileId`): the set the `posts`
// policies scope a host's moderation to. Fail-safe to an empty list so a failed read denies.
async function hostedCircleIds(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<string[]> {
  const { data } = await admin.from('circles').select('id').eq('host_id', profileId)
  return (data ?? []).map((c: { id: string }) => c.id)
}

// May this moderator act on this report at all? Nobody acts on their own report: filing a report
// and then resolving it is the self-serve path the scenario in SCAN-679 rode. A platform
// moderator may act on anything else. A host may act only on a post or comment inside a Circle
// they host (the author arm of canModeratePost is irrelevant here: a report on your own post is
// still yours to delete through deletePost, not to "moderate").
async function canActOnReport(
  admin: ReturnType<typeof createAdminClient>,
  mod: Moderator,
  report: ReportRow,
): Promise<boolean> {
  if (report.reporter_id === mod.caller.id) return false
  if (mod.platform) return true
  if (report.target_type !== 'post' && report.target_type !== 'comment') return false
  const { data: post } = await admin
    .from('posts')
    .select('author_id, scope_id')
    .eq('id', report.target_id)
    .maybeSingle()
  if (!post) return false
  if ((post as { author_id: string }).author_id === mod.caller.id) return false
  return canModeratePost({
    callerId: mod.caller.id,
    communityRole: mod.caller.community_role,
    webRole: mod.caller.webRole,
    post: post as { author_id: string; scope_id: string | null },
    hostedCircleIds: await hostedCircleIds(admin, mod.caller.id),
  })
}

// A moderation action must act on the SAME target the report names (site-audit SEC-3): a
// moderator passing an unrelated id alongside an open report id must not be able to warn/suspend/
// cancel an arbitrary target. True only when the report's target matches.
function reportTargetMatches(report: ReportRow, type: TargetType, id: string): boolean {
  return report.target_type === type && report.target_id === id
}

// SEC-4 completeness (LIVE-652): the type allowlist above only names the KIND. A
// forged id still landed in the queue as a target a moderator could not open.
// One keyed read per type; a missing row uses the same refusal as a bad type so
// the two holes are not distinguishable. Comments live in posts with parent_id
// set; a top-level post is parent_id null.
async function reportTargetExists(
  admin: ReturnType<typeof createAdminClient>,
  type: TargetType,
  id: string,
): Promise<boolean> {
  if (!UUID_RE.test(id)) return false
  switch (type) {
    case 'post': {
      const { data } = await admin.from('posts').select('id').eq('id', id).is('parent_id', null).maybeSingle()
      return !!data
    }
    case 'comment': {
      const { data } = await admin.from('posts').select('id').eq('id', id).not('parent_id', 'is', null).maybeSingle()
      return !!data
    }
    case 'dispatch': {
      const { data } = await admin.from('dispatches').select('id').eq('id', id).maybeSingle()
      return !!data
    }
    case 'member': {
      const { data } = await admin.from('profiles').select('id').eq('id', id).maybeSingle()
      return !!data
    }
    case 'event': {
      const { data } = await admin.from('events').select('id').eq('id', id).maybeSingle()
      return !!data
    }
    case 'guestbook': {
      const { data } = await admin.from('spotlight_guestbook').select('id').eq('id', id).maybeSingle()
      return !!data
    }
  }
  return false
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
  if (!(await reportTargetExists(admin, targetType, targetId))) {
    return fail('Invalid report target')
  }

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
//   guestbook    → soft-hide (spotlight_guestbook.hidden_at — the owner's own hide seam,
//                  so the note keeps its slot and the signer cannot re-sign; ADR-1279)
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
  const mod = await resolveModerator()
  if (!mod) {
    return fail('Unauthorized')
  }
  if (action !== 'actioned' && action !== 'dismissed') return fail('Invalid action')
  const { caller } = mod

  const admin = createAdminClient()
  const report = await loadReport(admin, reportId)
  if (!report || !(await canActOnReport(admin, mod, report))) {
    return fail('Unauthorized')
  }

  let hidden: { targetType: string; targetId: string } | null = null

  if (action === 'actioned') {
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
    } else if (report.target_type === 'guestbook') {
      // The guestbook table carries hidden_at only (no hidden_by); the audit row below names the moderator.
      await admin.from('spotlight_guestbook').update({ hidden_at: hidePayload.hidden_at }).eq('id', report.target_id)
      hidden = { targetType: report.target_type, targetId: report.target_id }
    }
    // member/event handled via dedicated helpers; reviewReport just closes them.
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
  const mod = await resolveModerator()
  // Warning a member is platform scope: a host has no standing over a member outside a post.
  if (!mod || !mod.platform) {
    return fail('Unauthorized')
  }
  const { caller } = mod

  const admin = createAdminClient()
  const report = await loadReport(admin, reportId)
  if (!report || !(await canActOnReport(admin, mod, report))) {
    return fail('Unauthorized')
  }

  // The report must actually name this member (SEC-3).
  if (!reportTargetMatches(report, 'member', memberProfileId)) {
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
  const mod = await resolveModerator()
  // Suspending a member is platform scope: a host has no standing over a member outside a post.
  if (!mod || !mod.platform) {
    return fail('Unauthorized')
  }
  const { caller } = mod

  const admin = createAdminClient()
  const report = await loadReport(admin, reportId)
  if (!report || !(await canActOnReport(admin, mod, report))) {
    return fail('Unauthorized')
  }

  // The report must actually name this member (SEC-3).
  if (!reportTargetMatches(report, 'member', memberProfileId)) {
    return fail('This report does not target that member')
  }

  // Nobody suspends themselves, and nobody suspends platform staff or a granted Platform
  // moderator through the report queue: that is an account decision, not a moderation one.
  if (memberProfileId === caller.id) return fail('You cannot suspend yourself')
  const { data: target } = await admin
    .from('profiles')
    .select('web_role')
    .eq('id', memberProfileId)
    .maybeSingle()
  if (!target) return fail('Member not found')
  if (canModeratePlatform(asWebRole((target as { web_role: string | null }).web_role))) {
    return fail('Staff and moderators cannot be suspended from the report queue')
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
  const mod = await resolveModerator()
  // Cancelling an event is platform scope: a host has no standing over an event through a report.
  if (!mod || !mod.platform) {
    return fail('Unauthorized')
  }
  const { caller } = mod

  const admin = createAdminClient()
  const report = await loadReport(admin, reportId)
  if (!report || !(await canActOnReport(admin, mod, report))) {
    return fail('Unauthorized')
  }

  // The report must actually name this event (SEC-3).
  if (!reportTargetMatches(report, 'event', eventId)) {
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
  revalidatePath('/nearby')
  return ok()
}

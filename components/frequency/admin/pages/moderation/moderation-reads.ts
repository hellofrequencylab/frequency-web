import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { staffCan } from '@/lib/core/staff-roles'
import { canModeratePlatform } from '@/lib/moderation/scope'
import { scopeReportsToViewer, type RawReport } from '@/components/widgets/admin/admin-moderation-queue'

// THE MODERATION TABS' READS (Frequency /admin/moderation: Resolved and Blocked, and the median response in
// the head). Read-only and fail-quiet; the route's requireAdmin gate ran first, and every list is narrowed to
// what this viewer may act on with the queue's own scoping (scopeReportsToViewer), so a Circle host sees the
// resolved reports in the Circles they host and no one else's. Blocked (suspended members) is platform scope
// only: a Circle host cannot suspend, so they are shown none.

export interface ResolvedReport {
  id: string
  reason: string
  targetType: string
  status: string
  createdAt: string
  reviewedAt: string | null
  reporterName: string
  details: string | null
}

export interface BlockedMember {
  id: string
  name: string
  handle: string
  avatarUrl: string | null
  since: string
  until: string | null
  reason: string | null
}

const RESOLVED_LIMIT = 50

export async function loadResolvedReports(): Promise<ResolvedReport[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('reports')
      .select(
        `id, target_type, target_id, reason, details, status, created_at, reviewed_at,
         reporter:profiles!reporter_id ( id, display_name, handle, avatar_url )`,
      )
      .in('status', ['actioned', 'dismissed', 'reviewed'])
      .order('reviewed_at', { ascending: false, nullsFirst: false })
      .limit(RESOLVED_LIMIT)
    if (error) return []
    const rows = (data ?? []) as unknown as (RawReport & { reviewed_at: string | null })[]
    const scoped = new Set((await scopeReportsToViewer(admin, rows)).map((r) => r.id))
    return rows
      .filter((r) => scoped.has(r.id))
      .map((r) => ({
        id: r.id,
        reason: r.reason,
        targetType: r.target_type,
        status: r.status,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
        reporterName: r.reporter?.display_name ?? 'A member',
        details: r.details,
      }))
  } catch {
    return []
  }
}

/** The median hours from report to review over the resolved reports that carry a review time; null when
 *  none do. PURE. */
export function medianResponseHours(reports: ResolvedReport[]): number | null {
  const hours = reports
    .map((r) => (r.reviewedAt ? (Date.parse(r.reviewedAt) - Date.parse(r.createdAt)) / 3_600_000 : NaN))
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b)
  if (hours.length === 0) return null
  const mid = Math.floor(hours.length / 2)
  return hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2
}

/** A median response in the design's words ("3 hours", "40 minutes", "2 days"). PURE. */
export function responseLabel(hours: number): string {
  if (hours < 1) {
    const m = Math.max(1, Math.round(hours * 60))
    return `${m} ${m === 1 ? 'minute' : 'minutes'}`
  }
  if (hours < 48) {
    const h = Math.round(hours)
    return `${h} ${h === 1 ? 'hour' : 'hours'}`
  }
  const d = Math.round(hours / 24)
  return `${d} days`
}

export async function loadBlockedMembers(): Promise<BlockedMember[]> {
  try {
    const caller = await getCallerProfile()
    if (!caller) return []
    const staff = await getStaffMember().catch(() => null)
    if (!canModeratePlatform(caller.webRole) && !staffCan(staff?.role, 'community', 'write')) return []
    const nowIso = new Date().toISOString()
    const { data, error } = await createAdminClient()
      .from('profiles')
      .select('id, display_name, handle, avatar_url, suspended_at, suspended_until, suspended_reason')
      .not('suspended_at', 'is', null)
      .or(`suspended_until.is.null,suspended_until.gt.${nowIso}`)
      .order('suspended_at', { ascending: false })
      .limit(100)
    if (error) return []
    return (
      (data ?? []) as {
        id: string
        display_name: string | null
        handle: string
        avatar_url: string | null
        suspended_at: string
        suspended_until: string | null
        suspended_reason: string | null
      }[]
    ).map((p) => ({
      id: p.id,
      name: p.display_name ?? p.handle,
      handle: p.handle,
      avatarUrl: p.avatar_url,
      since: p.suspended_at,
      until: p.suspended_until,
      reason: p.suspended_reason,
    }))
  } catch {
    return []
  }
}

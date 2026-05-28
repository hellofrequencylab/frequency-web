'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'
type TargetType = 'post' | 'dispatch' | 'comment' | 'member' | 'event'
type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other'
type ReportStatus = 'pending' | 'reviewed' | 'actioned' | 'dismissed'

const HIERARCHY: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'janitor']

async function getCallerProfile(): Promise<{ id: string; community_role: CommunityRole } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return data as { id: string; community_role: CommunityRole } | null
}

function hasRole(callerRole: CommunityRole, minRole: CommunityRole): boolean {
  return HIERARCHY.indexOf(callerRole) >= HIERARCHY.indexOf(minRole)
}

// ── Report content ──────────────────────────────────────────────────────────

export async function reportContent(
  targetType: TargetType,
  targetId: string,
  reason: ReportReason,
  details?: string
): Promise<{ success: boolean; error?: string }> {
  const caller = await getCallerProfile()
  if (!caller) return { success: false, error: 'Not authenticated' }

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
    return { success: false, error: 'You have already reported this content' }
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
    return { success: false, error: 'Failed to submit report' }
  }

  return { success: true }
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

export async function reviewReport(
  reportId: string,
  action: 'actioned' | 'dismissed'
): Promise<{ success: boolean; error?: string }> {
  const caller = await getCallerProfile()
  if (!caller || !hasRole(caller.community_role, 'host')) {
    return { success: false, error: 'Unauthorized' }
  }

  const admin = createAdminClient()

  // If actioning, fetch the report to auto-delete the offending content
  if (action === 'actioned') {
    const { data: report } = await admin
      .from('reports')
      .select('target_type, target_id')
      .eq('id', reportId)
      .maybeSingle()

    if (report) {
      if (report.target_type === 'post' || report.target_type === 'comment') {
        await admin.from('posts').delete().eq('id', report.target_id)
      } else if (report.target_type === 'dispatch') {
        await admin.from('dispatches').delete().eq('id', report.target_id)
      }
      // For 'member' and 'event' types, we just mark the report as actioned
      // without auto-deleting. Admins can handle those manually.
    }
  }

  const { error } = await admin
    .from('reports')
    .update({
      status: action,
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  if (error) {
    console.error('[reviewReport]', error.message)
    return { success: false, error: 'Failed to update report' }
  }

  revalidatePath('/admin/moderation')
  revalidatePath('/feed')
  revalidatePath('/broadcast')
  return { success: true }
}

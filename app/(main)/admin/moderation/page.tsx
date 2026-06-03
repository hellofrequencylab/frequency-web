import { notFound } from 'next/navigation'
import { SidebarCard } from '@/components/ui/sidebar-card'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ModerationQueue } from './moderation-queue'


type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

export default async function ModerationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  const role = profile.community_role as CommunityRole
  if (!['host', 'guide', 'mentor', 'admin', 'janitor'].includes(role)) notFound()

  // Fetch pending reports with reporter info
  const { data: rawReports } = await admin
    .from('reports')
    .select(
      `id, target_type, target_id, reason, details, status, created_at,
       reporter:profiles!reporter_id ( id, display_name, handle, avatar_url )`
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)

  type RawReport = {
    id: string
    target_type: string
    target_id: string
    reason: string
    details: string | null
    status: string
    created_at: string
    reporter: {
      id: string
      display_name: string
      handle: string
      avatar_url: string | null
    }
  }

  const reports = (rawReports ?? []) as unknown as RawReport[]

  // Gather target previews for each report
  const postIds = reports.filter((r) => r.target_type === 'post' || r.target_type === 'comment').map((r) => r.target_id)
  const dispatchIds = reports.filter((r) => r.target_type === 'dispatch').map((r) => r.target_id)
  const memberIds = reports.filter((r) => r.target_type === 'member').map((r) => r.target_id)
  const eventIds = reports.filter((r) => r.target_type === 'event').map((r) => r.target_id)

  const postPreviews: Record<string, string> = {}
  const dispatchPreviews: Record<string, string> = {}
  const memberPreviews: Record<string, string> = {}
  const eventPreviews: Record<string, string> = {}

  if (postIds.length > 0) {
    const { data } = await admin.from('posts').select('id, body').in('id', postIds)
    for (const p of data ?? []) {
      const body = (p as { id: string; body: string | null }).body ?? ''
      postPreviews[p.id] = body.length > 120 ? body.slice(0, 120) + '...' : body
    }
  }

  if (dispatchIds.length > 0) {
    const { data } = await admin.from('dispatches').select('id, title, excerpt').in('id', dispatchIds)
    for (const d of data ?? []) {
      const typed = d as { id: string; title: string; excerpt: string | null }
      dispatchPreviews[d.id] = typed.title + (typed.excerpt ? ` - ${typed.excerpt.slice(0, 80)}` : '')
    }
  }

  if (memberIds.length > 0) {
    const { data } = await admin.from('profiles').select('id, display_name, handle').in('id', memberIds)
    for (const m of data ?? []) {
      const typed = m as { id: string; display_name: string; handle: string }
      memberPreviews[m.id] = `${typed.display_name} (@${typed.handle})`
    }
  }

  if (eventIds.length > 0) {
    const { data } = await admin.from('events').select('id, title').in('id', eventIds)
    for (const e of data ?? []) {
      const typed = e as { id: string; title: string }
      eventPreviews[e.id] = typed.title
    }
  }

  // For member-targeted reports, also fetch prior report count so the mod
  // can see "this member has been reported N times" inline.
  const memberPriorCounts: Record<string, number> = {}
  if (memberIds.length > 0) {
    for (const mid of memberIds) {
      const { count } = await admin
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('target_type', 'member')
        .eq('target_id', mid)
      memberPriorCounts[mid] = count ?? 0
    }
  }

  type ReportWithPreview = RawReport & { preview: string; priorReports?: number }
  const reportsWithPreviews: ReportWithPreview[] = reports.map((r) => {
    let preview = ''
    let priorReports: number | undefined
    if (r.target_type === 'post' || r.target_type === 'comment') {
      preview = postPreviews[r.target_id] ?? '[Content not found]'
    } else if (r.target_type === 'dispatch') {
      preview = dispatchPreviews[r.target_id] ?? '[Broadcast not found]'
    } else if (r.target_type === 'member') {
      preview = memberPreviews[r.target_id] ?? '[Member not found]'
      priorReports = memberPriorCounts[r.target_id]
    } else if (r.target_type === 'event') {
      preview = eventPreviews[r.target_id] ?? '[Event not found]'
    }
    return { ...r, preview, priorReports }
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text">Moderation</h1>
        <p className="text-sm text-muted mt-1">
          Review reports submitted by community members.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          {reportsWithPreviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface/50 dark:bg-canvas/50 p-8 text-center">
              <p className="text-sm text-muted">No pending reports</p>
            </div>
          ) : (
            <ModerationQueue reports={reportsWithPreviews} />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <SidebarCard title="About Moderation">
            <p className="px-4 py-3 text-xs text-subtle">Reports are visible to host+ roles. Acting on a report resolves it. Dismissed reports are hidden but not deleted.</p>
          </SidebarCard>
        </div>
      </div>
    </div>
  )
}

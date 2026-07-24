import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { createAdminClient } from '@/lib/supabase/admin'
import { ModerationQueue } from '@/app/(main)/admin/moderation/moderation-queue'

// Admin Moderation layout module (LP7, ADR-270/294): the community report queue — the pending
// reports ranked newest first, each with a target preview and (for member-targeted reports) the
// prior-report count, plus the "queue is clear" empty. A self-fetching, fail-safe RSC: it reads the
// reports and every target preview itself, so the page hands it nothing. There is no searchParams
// facet. The page keeps its host + community-staff gate; this renders only through that gated route,
// so it never re-gates.

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

type ReportWithPreview = RawReport & { preview: string; priorReports?: number }

export async function AdminModerationQueue() {
  const admin = createAdminClient()

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
  // can see "this member has been reported N times" inline. One grouped
  // query (was N+1: one count query per reported member) — fetch every
  // member-targeted report row for these members and tally in a Map.
  const memberPriorCounts: Record<string, number> = {}
  if (memberIds.length > 0) {
    const { data: priorRows } = await admin
      .from('reports')
      .select('target_id')
      .eq('target_type', 'member')
      .in('target_id', memberIds)
    for (const mid of memberIds) memberPriorCounts[mid] = 0
    for (const row of priorRows ?? []) {
      const tid = (row as { target_id: string }).target_id
      memberPriorCounts[tid] = (memberPriorCounts[tid] ?? 0) + 1
    }
  }

  const reportsWithPreviews: ReportWithPreview[] = reports.map((r) => {
    let preview = ''
    let priorReports: number | undefined
    if (r.target_type === 'post' || r.target_type === 'comment') {
      preview = postPreviews[r.target_id] ?? '[Content not found]'
    } else if (r.target_type === 'dispatch') {
      preview = dispatchPreviews[r.target_id] ?? '[Dispatch not found]'
    } else if (r.target_type === 'member') {
      preview = memberPreviews[r.target_id] ?? '[Member not found]'
      priorReports = memberPriorCounts[r.target_id]
    } else if (r.target_type === 'event') {
      preview = eventPreviews[r.target_id] ?? '[Event not found]'
    }
    return { ...r, preview, priorReports }
  })

  return (
    <AdminSection>
      {reportsWithPreviews.length === 0 ? (
        <EmptyState
          variant="cleared"
          title="The queue is clear"
          description="No reports are waiting. New member reports will appear here for review."
        />
      ) : (
        <ModerationQueue reports={reportsWithPreviews} />
      )}
    </AdminSection>
  )
}

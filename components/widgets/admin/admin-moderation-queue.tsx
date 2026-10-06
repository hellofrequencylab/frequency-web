import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { staffCan } from '@/lib/core/staff-roles'
import { canModeratePlatform } from '@/lib/moderation/scope'
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

// SCAN-679: the queue shows a viewer only what the actions in feed/report-actions.ts would let
// them act on. Platform scope (staff, a granted Platform moderator, or a community-domain staff
// role) sees every pending report. A community host sees only reports on posts and comments
// inside Circles they host, and never their own reports. Fail-safe: a missing caller sees nothing.
async function scopeReportsToViewer(
  admin: ReturnType<typeof createAdminClient>,
  reports: RawReport[],
): Promise<RawReport[]> {
  const caller = await getCallerProfile()
  if (!caller) return []
  const notOwn = reports.filter((r) => r.reporter.id !== caller.id)
  if (canModeratePlatform(caller.webRole)) return notOwn
  const staff = await getStaffMember().catch(() => null)
  if (staffCan(staff?.role, 'community', 'write')) return notOwn
  const { data: hosted } = await admin.from('circles').select('id').eq('host_id', caller.id)
  const hostedIds = new Set((hosted ?? []).map((c: { id: string }) => c.id))
  if (hostedIds.size === 0) return []
  const postReports = notOwn.filter((r) => r.target_type === 'post' || r.target_type === 'comment')
  if (postReports.length === 0) return []
  const { data: posts } = await admin
    .from('posts')
    .select('id, author_id, scope_id')
    .in('id', postReports.map((r) => r.target_id))
  const inScope = new Set(
    (posts ?? [])
      .filter((p: { author_id: string; scope_id: string | null }) => p.author_id !== caller.id && p.scope_id != null && hostedIds.has(p.scope_id))
      .map((p: { id: string }) => p.id),
  )
  return postReports.filter((r) => inScope.has(r.target_id))
}

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

  const reports = await scopeReportsToViewer(admin, (rawReports ?? []) as unknown as RawReport[])

  // Gather target previews for each report
  const postIds = reports.filter((r) => r.target_type === 'post' || r.target_type === 'comment').map((r) => r.target_id)
  const dispatchIds = reports.filter((r) => r.target_type === 'dispatch').map((r) => r.target_id)
  const memberIds = reports.filter((r) => r.target_type === 'member').map((r) => r.target_id)
  const eventIds = reports.filter((r) => r.target_type === 'event').map((r) => r.target_id)
  const guestbookIds = reports.filter((r) => r.target_type === 'guestbook').map((r) => r.target_id)

  const postPreviews: Record<string, string> = {}
  const dispatchPreviews: Record<string, string> = {}
  const memberPreviews: Record<string, string> = {}
  const eventPreviews: Record<string, string> = {}
  const guestbookPreviews: Record<string, string> = {}

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

  if (guestbookIds.length > 0) {
    // A reported Guestbook note (ADR-1279): the note text is the only member-supplied field.
    const { data } = await admin.from('spotlight_guestbook').select('id, message').in('id', guestbookIds)
    for (const g of data ?? []) {
      const message = (g as { id: string; message: string | null }).message ?? ''
      guestbookPreviews[g.id] = message.length > 120 ? message.slice(0, 120) + '...' : message
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
    } else if (r.target_type === 'guestbook') {
      preview = guestbookPreviews[r.target_id] ?? '[Note not found]'
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

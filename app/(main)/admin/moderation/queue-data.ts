import { createAdminClient } from '@/lib/supabase/admin'

// Pending reports + target previews + per-member prior-report counts. Shared by the
// in-place Moderation module (ADR-138 Safety) — and the source the /admin/moderation
// page should adopt to DRY (it currently assembles this inline; follow-up).

export type ModerationReport = {
  id: string
  target_type: string
  target_id: string
  reason: string
  details: string | null
  status: string
  created_at: string
  preview: string
  priorReports?: number
  reporter: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  }
}

export async function getPendingReportsWithPreviews(): Promise<ModerationReport[]> {
  const admin = createAdminClient()

  const { data: rawReports } = await admin
    .from('reports')
    .select(
      `id, target_type, target_id, reason, details, status, created_at,
       reporter:profiles!reporter_id ( id, display_name, handle, avatar_url )`,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)

  type RawReport = Omit<ModerationReport, 'preview' | 'priorReports'>
  const reports = (rawReports ?? []) as unknown as RawReport[]

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

  const memberPriorCounts: Record<string, number> = {}
  for (const mid of memberIds) {
    const { count } = await admin
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('target_type', 'member')
      .eq('target_id', mid)
    memberPriorCounts[mid] = count ?? 0
  }

  return reports.map((r) => {
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
}

import { createAdminClient } from '@/lib/supabase/admin'

// Recent dispatches relevant to a member — their own, plus anything published to a
// circle / hub / nexus they belong to. Shared by the right-rail "Dispatches"
// widget and the community news ticker so the query lives in exactly one place.

export type RecentDispatch = {
  id: string
  title: string
  audienceScope: string
  publishedAt: string
  authorName: string | null
  /** Present when the dispatch is tied to a crew task (drives the ⚡ vs 📣 icon). */
  linkedTaskId: string | null
}

export async function getRecentDispatchesForProfile(
  profileId: string,
  opts: { circleIds?: string[]; limit?: number } = {},
): Promise<RecentDispatch[]> {
  const admin = createAdminClient()
  const limit = opts.limit ?? 5

  // Callers that already resolved the member's circles (e.g. the right rail) pass
  // them in; otherwise we fetch them here so the helper stands alone.
  let circleIds = opts.circleIds
  if (!circleIds) {
    const { data: mems } = await admin
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
    circleIds = (mems ?? []).map((m: { circle_id: string }) => m.circle_id as string)
  }

  // Resolve hub → nexus IDs for those circles (dispatches can target any tier).
  let hubIds: string[] = []
  let nexusIds: string[] = []
  if (circleIds.length > 0) {
    const { data: circles } = await admin.from('circles').select('hub_id').in('id', circleIds)
    hubIds = (circles ?? []).map((c: { hub_id: string | null }) => c.hub_id).filter(Boolean) as string[]
  }
  if (hubIds.length > 0) {
    const { data: hubs } = await admin.from('hubs').select('nexus_id').in('id', hubIds)
    nexusIds = (hubs ?? []).map((h: { nexus_id: string | null }) => h.nexus_id).filter(Boolean) as string[]
  }

  const select = `id, title, audience_scope, published_at,
    author:profiles!author_id ( display_name ),
    linked_task:crew_tasks!linked_task_id ( id )`

  type Row = {
    id: string
    title: string
    audience_scope: string
    published_at: string
    author: { display_name: string } | null
    linked_task: { id: string } | null
  }

  const base = () => admin.from('dispatches').select(select).eq('status', 'published').is('hidden_at', null)
  const promises: Promise<{ data: Row[] | null }>[] = [
    base().eq('author_id', profileId).order('published_at', { ascending: false }).limit(limit) as unknown as Promise<{ data: Row[] | null }>,
  ]
  if (circleIds.length > 0)
    promises.push(base().eq('audience_scope', 'circle').in('audience_id', circleIds)
      .order('published_at', { ascending: false }).limit(limit) as unknown as Promise<{ data: Row[] | null }>)
  if (hubIds.length > 0)
    promises.push(base().eq('audience_scope', 'hub').in('audience_id', hubIds)
      .order('published_at', { ascending: false }).limit(limit) as unknown as Promise<{ data: Row[] | null }>)
  if (nexusIds.length > 0)
    promises.push(base().eq('audience_scope', 'nexus').in('audience_id', nexusIds)
      .order('published_at', { ascending: false }).limit(limit) as unknown as Promise<{ data: Row[] | null }>)

  const results = await Promise.all(promises)
  const seen = new Set<string>()
  return results
    .flatMap((r) => r.data ?? [])
    .filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, limit)
    .map((d) => ({
      id: d.id,
      title: d.title,
      audienceScope: d.audience_scope,
      publishedAt: d.published_at,
      authorName: d.author?.display_name ?? null,
      linkedTaskId: d.linked_task?.id ?? null,
    }))
}

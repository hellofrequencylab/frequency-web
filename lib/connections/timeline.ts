import { createClient } from '@/lib/supabase/server'

// The auto interaction timeline (ADR-186, P3) — the caller's private, event-derived
// history with one member. relationship_timeline is SECURITY DEFINER keyed to
// auth.uid(), so it MUST run on the authed client. Not in generated types yet →
// untyped cast (repo convention).

export type TimelineKind = 'met' | 'connected' | 'co_event'

export interface TimelineItem {
  kind: TimelineKind
  title: string
  at: string | null
}

export async function getRelationshipTimeline(otherId: string, limit = 50): Promise<TimelineItem[]> {
  const supabase = (await createClient())
  const { data, error } = await supabase.rpc('relationship_timeline', { _other: otherId, _limit: limit })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, unknown>[]).map((r) => ({
    kind: (r.kind as TimelineKind) ?? 'co_event',
    title: String(r.title ?? ''),
    at: (r.at as string | null) ?? null,
  }))
}

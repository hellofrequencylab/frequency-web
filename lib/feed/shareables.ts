// The Practices and Journeys a member can share into a post (LIVE-682, the composer's Share kind).
// Read through the SESSION client, so RLS hands back only the caller's own rows and the Practices
// and Journeys they can read; the share is a link, and the target page keeps governing who can open it.

import { createClient } from '@/lib/supabase/server'

import type { Shareable } from './share-line'

export type { Shareable }

export async function listShareablesFor(profileId: string): Promise<Shareable[]> {
  const supabase = await createClient()
  const [{ data: practices }, { data: journeys }] = await Promise.all([
    supabase
      .from('member_practices')
      .select('practice_id, practices(id, title)')
      .eq('profile_id', profileId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('journey_enrollments')
      .select('plan_id, journey_plans(slug, title)')
      .eq('profile_id', profileId)
      .order('started_at', { ascending: false })
      .limit(20),
  ])
  const out: Shareable[] = []
  const seen = new Set<string>()
  for (const r of (practices ?? []) as unknown as Array<{ practices: { id: string; title: string | null } | null }>) {
    const p = r.practices
    if (!p?.title || seen.has(`p:${p.id}`)) continue
    seen.add(`p:${p.id}`)
    out.push({ kind: 'practice', label: p.title, href: `/practices/${p.id}` })
  }
  for (const r of (journeys ?? []) as unknown as Array<{ journey_plans: { slug: string; title: string | null } | null }>) {
    const j = r.journey_plans
    if (!j?.title || seen.has(`j:${j.slug}`)) continue
    seen.add(`j:${j.slug}`)
    out.push({ kind: 'journey', label: j.title, href: `/journeys/${j.slug}` })
  }
  return out
}

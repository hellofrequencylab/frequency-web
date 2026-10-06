// Collaborator featured directory (P3 — partner persona "Collaborator", LIVE-708). The read side:
// members who hold an active Collaborator persona OR whose Practice or Journey is featured, each
// with the public work they made and a link to it, for the browse directory. Server-only.

import { createAdminClient } from '@/lib/supabase/admin'

/** One piece of public work on a collaborator's card. */
export interface CollaboratorWork {
  kind: 'journey' | 'practice'
  title: string
  href: string
  featured: boolean
}

interface CollaboratorCard {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
  journeyCount: number
  practiceCount: number
  /** Featured first, then newest; at most WORK_PER_CARD. */
  work: CollaboratorWork[]
}

const WORK_PER_CARD = 3

export async function listCollaborators(): Promise<CollaboratorCard[]> {
  const admin = createAdminClient()

  // Active Collaborator personas (profile_personas isn't in the generated types yet), plus the
  // authors of featured public work: a featured creator belongs in the directory either way.
  const [{ data: rows }, { data: featuredJourneys }, { data: featuredPractices }] = await Promise.all([
    admin.from('profile_personas').select('profile_id').eq('persona', 'collaborator').neq('state', 'suspended'),
    admin.from('journey_plans').select('author_id').eq('visibility', 'public').not('featured_at', 'is', null),
    admin.from('practices').select('created_by').eq('is_public', true).not('featured_at', 'is', null),
  ])
  const ids = [
    ...new Set([
      ...(rows ?? []).map((r: { profile_id: string }) => r.profile_id as string),
      ...(featuredJourneys ?? []).map((j) => j.author_id as string | null),
      ...(featuredPractices ?? []).map((p) => p.created_by as string | null),
    ]),
  ].filter((id): id is string => !!id)
  if (!ids.length) return []

  const [{ data: profiles }, { data: journeys }, { data: practices }] = await Promise.all([
    admin.from('profiles').select('id, handle, display_name, avatar_url').in('id', ids).eq('is_active', true),
    admin
      .from('journey_plans')
      .select('author_id, title, slug, featured_at, created_at')
      .in('author_id', ids)
      .eq('visibility', 'public'),
    admin
      .from('practices')
      .select('id, created_by, title, featured_at, created_at')
      .in('created_by', ids)
      .eq('is_public', true),
  ])

  const work = new Map<string, (CollaboratorWork & { at: string })[]>()
  const journeyCounts = new Map<string, number>()
  const practiceCounts = new Map<string, number>()
  const push = (id: string, w: CollaboratorWork & { at: string }) => work.set(id, [...(work.get(id) ?? []), w])
  for (const j of journeys ?? []) {
    const a = j.author_id as string | null
    if (!a || !j.slug) continue
    journeyCounts.set(a, (journeyCounts.get(a) ?? 0) + 1)
    push(a, { kind: 'journey', title: j.title, href: `/journeys/${j.slug}`, featured: !!j.featured_at, at: j.created_at })
  }
  for (const p of practices ?? []) {
    const a = p.created_by as string | null
    if (!a) continue
    practiceCounts.set(a, (practiceCounts.get(a) ?? 0) + 1)
    push(a, { kind: 'practice', title: p.title, href: `/practices/${p.id}`, featured: !!p.featured_at, at: p.created_at })
  }

  return (profiles ?? [])
    .filter((p): p is typeof p & { handle: string } => !!p.handle)
    .map((p) => ({
      id: p.id,
      handle: p.handle,
      displayName: p.display_name ?? p.handle,
      avatarUrl: p.avatar_url,
      journeyCount: journeyCounts.get(p.id) ?? 0,
      practiceCount: practiceCounts.get(p.id) ?? 0,
      work: (work.get(p.id) ?? [])
        .sort((a, b) => Number(b.featured) - Number(a.featured) || b.at.localeCompare(a.at))
        .slice(0, WORK_PER_CARD)
        .map(({ at: _at, ...w }) => w),
    }))
    .sort(
      (a, b) =>
        b.journeyCount + b.practiceCount - (a.journeyCount + a.practiceCount) || a.displayName.localeCompare(b.displayName),
    )
}

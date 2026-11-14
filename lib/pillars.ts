import { createAdminClient } from '@/lib/supabase/admin'
import { getMemberPractices } from '@/lib/practices'
import { practiceSupportIds } from '@/lib/practices/support-filter'
import type { PillarSlug } from '@/lib/pillars/slugs'

// The 4 Pillars are the `pillars` table (Mind · Body · Spirit · Expression) — the
// support areas for practices and Journeys. A practice can support several Pillars.
// Channels are a separate topic vocabulary; callers share this typed Pillar catalog.
//
// This module is SERVER-ONLY by construction — `getMemberPractices` above makes it so, and
// `lib/practices.ts` now says so with a directive rather than a comment. The closed slug set moved
// to lib/pillars/slugs.ts (LIVE-009) because `circle-builder.tsx` ('use client') imports
// `PILLAR_SLUGS`, which pulled this whole graph into the browser. Re-exported here so the ~50
// existing importers are unchanged; CLIENT code must import from '@/lib/pillars/slugs'.
export { PILLAR_SLUGS } from '@/lib/pillars/slugs'
export type { PillarSlug } from '@/lib/pillars/slugs'

export interface Pillar {
  id: string
  slug: PillarSlug
  name: string
  description: string | null
  /** Per-pillar accent color token/value (pillars.accent). */
  accent: string | null
  order: number
}

/** The four pillars in display order. Small + static — cheap to read per request. */
export async function getPillars(): Promise<Pillar[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('pillars')
    .select('id, slug, name, description, accent, display_order')
    .eq('is_active', true)
    .order('display_order')

  return ((data ?? []) as Array<{
    id: string
    slug: string
    name: string
    description: string | null
    accent: string | null
    display_order: number
  }>).map((d) => ({
    id: d.id,
    slug: d.slug as PillarSlug,
    name: d.name,
    description: d.description,
    accent: d.accent,
    order: d.display_order,
  }))
}

/** Index pillars by id, for mapping a practice's `domain_id` → its Pillar. */
export function pillarsById(pillars: Pillar[]): Map<string, Pillar> {
  return new Map(pillars.map((p) => [p.id, p]))
}

export interface PillarCount {
  slug: PillarSlug
  name: string
  count: number
}

/** Current adopted practices counted once per authored support area, in catalog order.
 *  Areas overlap: these counts are not a unique practice total, performed days or wellbeing.
 *  The legacy array API remains zero-filled for the feed and practice widgets. */
export async function getMemberPillarBalance(profileId: string): Promise<PillarCount[]> {
  const [practices, pillars] = await Promise.all([getMemberPractices(profileId), getPillars()])
  const known = new Set(pillars.map((p) => p.id))
  const supportsByPractice = new Map<string, Set<string>>()
  for (const practice of practices) {
    const supports = supportsByPractice.get(practice.id) ?? new Set<string>()
    for (const id of practiceSupportIds(practice)) if (known.has(id)) supports.add(id)
    supportsByPractice.set(practice.id, supports)
  }
  const counts = new Map<string, number>()
  for (const supports of supportsByPractice.values()) {
    for (const id of supports) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return pillars.map((pl) => ({ slug: pl.slug, name: pl.name, count: counts.get(pl.id) ?? 0 }))
}

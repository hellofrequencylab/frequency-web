import { createAdminClient } from '@/lib/supabase/admin'
import { getMemberPractices } from '@/lib/practices'

// The 4 Pillars are the `pillars` table (Mind · Body · Spirit · Expression) — the
// organizing axis for practices (practices.domain_id) and, next, the open Journeys
// library (backlog §Q1). Surfaced product-wide as "Channels"; here we read them as
// the typed pillar set so callers don't re-query the taxonomy ad hoc.

export type PillarSlug = 'mind' | 'body' | 'spirit' | 'expression'

export const PILLAR_SLUGS: readonly PillarSlug[] = ['mind', 'body', 'spirit', 'expression']

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

/** A member's adopted practices counted per Pillar, in pillar order — the
 *  "balance" read for the feed Journey board. Always returns all four pillars
 *  (zero-filled) so the balance reads as coverage, not just what they have. */
export async function getMemberPillarBalance(profileId: string): Promise<PillarCount[]> {
  const [practices, pillars] = await Promise.all([getMemberPractices(profileId), getPillars()])
  const counts = new Map<string, number>()
  for (const p of practices) {
    if (p.domain_id) counts.set(p.domain_id, (counts.get(p.domain_id) ?? 0) + 1)
  }
  return pillars.map((pl) => ({ slug: pl.slug, name: pl.name, count: counts.get(pl.id) ?? 0 }))
}

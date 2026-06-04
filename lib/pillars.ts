import { createAdminClient } from '@/lib/supabase/admin'

// The 4 Pillars are the `domains` table (Mind · Body · Spirit · Expression) — the
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
  /** Per-pillar accent color token/value (domains.accent). */
  accent: string | null
  order: number
}

/** The four pillars in display order. Small + static — cheap to read per request. */
export async function getPillars(): Promise<Pillar[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('domains')
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

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { log, briefError } from '@/lib/log'

export const LEARNING_KINDS = ['program', 'journey', 'practice'] as const
export type LearningKind = (typeof LEARNING_KINDS)[number]
export const LEARNING_PAGE_SIZE = 12

interface SpaceLearningItem {
  id: string
  title: string
  summary: string | null
  href: string
}
export interface SpaceLearningPage {
  kind: LearningKind
  items: SpaceLearningItem[]
  page: number
  total: number
  unavailable: boolean
}

export function learningPageNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || !/^\d{1,5}$/.test(raw)) return 1
  return Math.max(1, Number(raw))
}

/** Public discovery, even for owners: tenant-scoped, explicitly published, and under caller RLS.
 *  Unlisted is readable by its known URL, not automatically eligible for a public catalog.
 *  No service-role fallback: an unavailable read is reported separately from an empty collection. */
export async function readSpaceLearningPage(spaceId: string, kind: LearningKind, page = 1): Promise<SpaceLearningPage> {
  const current = learningPageNumber(String(page))
  const empty = { kind, items: [], page: current, total: 0, unavailable: false }
  if (!spaceId) return empty
  try {
    const db = await createClient()
    const start = (current - 1) * LEARNING_PAGE_SIZE
    if (kind === 'program') {
      const { data, error, count } = await db.from('topical_channels')
        .select('id,name,slug,description', { count: 'exact' })
        .eq('owner_space_id', spaceId).eq('is_active', true).not('template_id', 'is', null)
        .order('name').order('id').range(start, start + LEARNING_PAGE_SIZE - 1)
      if (error) throw error
      const rows = data as unknown as { id: string; name: string; slug: string; description: string | null }[] | null
      return { ...empty, total: count ?? 0, items: (rows ?? []).map((row) => ({ id: row.id, title: row.name, summary: row.description, href: `/channels/${row.id}` })) }
    }
    if (kind === 'journey') {
      const { data, error, count } = await db.from('journey_plans')
        .select('id,title,slug,summary', { count: 'exact' })
        .eq('space_id', spaceId).eq('visibility', 'public').not('published_at', 'is', null).neq('status', 'rejected')
        .order('title').order('id').range(start, start + LEARNING_PAGE_SIZE - 1)
      if (error) throw error
      const rows = data as unknown as { id: string; title: string; slug: string; summary: string | null }[] | null
      return { ...empty, total: count ?? 0, items: (rows ?? []).map((row) => ({ id: row.id, title: row.title, summary: row.summary, href: `/journeys/${row.slug}` })) }
    }
    const { data, error, count } = await db.from('practices')
      .select('id,title,description', { count: 'exact' })
      .eq('space_id', spaceId).eq('is_public', true).eq('status', 'approved')
      .order('title').order('id').range(start, start + LEARNING_PAGE_SIZE - 1)
    if (error) throw error
    const rows = data as unknown as { id: string; title: string; description: string | null }[] | null
    return { ...empty, total: count ?? 0, items: (rows ?? []).map((row) => ({ id: row.id, title: row.title, summary: row.description, href: `/practices/${row.id}` })) }
  } catch (error) {
    log.warn('space_learning_read_failed', { kind, message: briefError(error) })
    return { ...empty, unavailable: true }
  }
}

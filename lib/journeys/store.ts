// Journeys v2 — server read for the lesson player (ADR-252, J1b). Composes the existing plan/
// item/lesson-progress reads (lib/journey-plans.ts) with the pure v2 read-model (tree.ts):
// load a journey's blocks + the member's completed lessons → the Phase → Module → Lesson tree
// the player renders, plus the per-lesson content keyed by id. Server-only (admin client).

import { getPlan, getCompletedLessonIds, type JourneyPlan } from '@/lib/journey-plans'
import { buildJourneyTree, type BlockRow, type JourneyTree, type LeafType } from './tree'

export interface LessonContent {
  id: string
  type: LeafType
  title: string
  body: string | null
  /** Lesson media jsonb ({ video, images, files }); rendered by the player. */
  media: unknown
  estMinutes: number | null
  practiceId: string | null
  required: boolean
}

export interface JourneyPlayerView {
  plan: JourneyPlan
  tree: JourneyTree
  /** Content for every renderable (non-container) lesson, keyed by item id. */
  lessonsById: Record<string, LessonContent>
}

const LEAF = new Set(['lesson', 'video', 'reading', 'exercise', 'reflection', 'check', 'resource', 'practice', 'section'])

/** The full player view for a member on a journey, or null if the slug doesn't resolve. */
export async function getJourneyPlayerView(slug: string, profileId: string): Promise<JourneyPlayerView | null> {
  const loaded = await getPlan(slug)
  if (!loaded) return null
  const { plan, items } = loaded
  const completed = await getCompletedLessonIds(profileId, plan.id)

  const blocks: BlockRow[] = items.map((i) => ({
    id: i.id,
    parent_id: i.parent_id ?? null,
    block_type: i.block_type ?? 'practice',
    sort_order: i.sort_order ?? 0,
    title: i.title ?? null,
    required: i.required ?? true,
    est_minutes: i.est_minutes ?? null,
    practice_id: i.practice_id || null,
  }))
  const tree = buildJourneyTree(blocks, completed)

  const lessonsById: Record<string, LessonContent> = {}
  for (const i of items) {
    const bt = i.block_type ?? 'practice'
    if (!LEAF.has(bt)) continue // skip phase/module containers
    lessonsById[i.id] = {
      id: i.id,
      type: (bt === 'section' ? 'lesson' : bt) as LeafType,
      title: i.title ?? 'Untitled',
      body: i.body ?? null,
      media: i.media ?? null,
      estMinutes: i.est_minutes ?? null,
      practiceId: i.practice_id || null,
      required: i.required ?? true,
    }
  }

  return { plan, tree, lessonsById }
}

/** Just the completion tree (for before/after reward computation in the complete action). */
export async function getJourneyTree(slug: string, profileId: string): Promise<JourneyTree | null> {
  const view = await getJourneyPlayerView(slug, profileId)
  return view?.tree ?? null
}

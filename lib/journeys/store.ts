// Journeys v2 — server read for the lesson player (ADR-252, J1b). Composes the existing plan/
// item/lesson-progress reads (lib/journey-plans.ts) with the pure v2 read-model (tree.ts):
// load a journey's blocks + the member's completed lessons → the Phase → Module → Lesson tree
// the player renders, plus the per-lesson content keyed by id. Server-only (admin client).

import { getPlan, getCompletedLessonIds, type JourneyPlan } from '@/lib/journey-plans'
import { buildJourneyTree, leafTitle, type BlockRow, type JourneyTree, type LeafType } from './tree'

/** An interactive knowledge-check (build item §11.1 #2): a multiple-choice question with
 *  instant feedback + retries (the testing effect; low-stakes, never gates progression).
 *  Stored on a `check` block's `settings.check`. */
export interface CheckConfig {
  question: string
  options: string[]
  /** Index of the correct option. */
  answer: number
  explanation: string | null
}

/** Parse `settings.check` into a CheckConfig, or null if absent/malformed (then the
 *  player falls back to a plain mark-complete check). */
export function parseCheck(settings: unknown): CheckConfig | null {
  const c = (settings as { check?: unknown } | null)?.check as Record<string, unknown> | undefined
  if (!c || typeof c.question !== 'string' || !Array.isArray(c.options)) return null
  const options = c.options.filter((o): o is string => typeof o === 'string')
  if (options.length < 2) return null
  const answer = typeof c.answer === 'number' ? Math.min(Math.max(0, Math.floor(c.answer)), options.length - 1) : 0
  return { question: c.question, options, answer, explanation: typeof c.explanation === 'string' ? c.explanation : null }
}

/** Vera's per-slot coaching line for a practice block, from `settings.coaching_prompt`. Null for
 *  non-practice blocks or when none is set (then the player shows no coaching note). */
function coachingFrom(blockType: string, settings: Record<string, unknown> | null | undefined): string | null {
  if (blockType !== 'practice') return null
  const cp = settings?.coaching_prompt
  return typeof cp === 'string' && cp.trim() ? cp : null
}

/** A per-step warm-up message override (ADR-592, P5), from `settings.warmup_message`. When set on
 *  a practice block, it replaces the practice's own warm-up message in the timer pre-roll for THIS
 *  Journey step, so a Host can choreograph the intro per week. Null for non-practice blocks / unset. */
function warmupFrom(blockType: string, settings: Record<string, unknown> | null | undefined): string | null {
  if (blockType !== 'practice') return null
  const wm = settings?.warmup_message
  return typeof wm === 'string' && wm.trim() ? wm.trim() : null
}

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
  /** Interactive knowledge-check config (check blocks only), else null. */
  check: CheckConfig | null
  /** Vera's per-slot coaching line (practice blocks), from settings.coaching_prompt, else null. */
  coachingPrompt: string | null
  /** A per-step warm-up message override (ADR-592, P5), from settings.warmup_message, else null.
   *  Overrides the practice's own warm-up message in the timer pre-roll for this Journey step. */
  warmupMessage: string | null
  /** Extra-credit block (ADR-300 Part 2): a bonus task that pays Zaps, not a Pillar practice. */
  extraCredit: boolean
  /** Bonus Zaps paid on completing an extra-credit block. */
  bonusZaps: number
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
    const settings = (i as { settings?: Record<string, unknown> | null }).settings
    const extraCredit = settings?.extra_credit === true
    lessonsById[i.id] = {
      id: i.id,
      type: (bt === 'section' ? 'lesson' : bt) as LeafType,
      title: leafTitle(i.title, bt === 'section' ? 'lesson' : bt),
      body: i.body ?? null,
      media: i.media ?? null,
      estMinutes: i.est_minutes ?? null,
      practiceId: i.practice_id || null,
      required: i.required ?? true,
      check: bt === 'check' ? parseCheck(settings) : null,
      coachingPrompt: coachingFrom(bt, settings),
      warmupMessage: warmupFrom(bt, settings),
      extraCredit,
      bonusZaps: extraCredit && settings && typeof settings.bonus_zaps === 'number' ? settings.bonus_zaps : 0,
    }
  }

  return { plan, tree, lessonsById }
}

/** Just the completion tree (for before/after reward computation in the complete action). */
export async function getJourneyTree(slug: string, profileId: string): Promise<JourneyTree | null> {
  const view = await getJourneyPlayerView(slug, profileId)
  return view?.tree ?? null
}

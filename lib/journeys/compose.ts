// Journey manual framework templates and read-only planning guidance.
// authz-delegated: insertChildren accepts the caller-authorized plan/parent and existing admin handle;
// all public actions perform their own fresh authorPlan or create gate before calling it.

import { WRITING_COACHING_FALLBACK } from '@/lib/ai/writing-coaching'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { getPillars } from '@/lib/pillars'
import {
  draftJourneyComposition,
  COMPOSE_PILLARS,
  type ComposePillar,
} from '@/lib/ai/journey-composition'
import { log } from '@/lib/log'

type AdminDb = ReturnType<typeof createAdminClient>
type NewBlock = Database['public']['Tables']['journey_plan_items']['Insert']
export type ComposedRow = Omit<NewBlock, 'plan_id' | 'parent_id' | 'sort_order'>

// Pure row factories are shared by both manual entry points, without importing this server graph.
export { PILLAR_SLOTS, personalJourneyRows, masterWeekRows, masterOnboardingRows, masterCloseRows } from './support-template'
export { extraCreditRow } from './extra-credit'

export const EXTRA_CREDIT_PLACEHOLDER = {
  title: 'Extra credit',
  body: 'An above-and-beyond bonus challenge. It is optional, and finishing it pays bonus Zaps.',
}

/** Pillar slug -> id, for tagging composed slots with their Pillar. */
export async function pillarIdsBySlug(): Promise<Partial<Record<ComposePillar, string>>> {
  const pillars = await getPillars()
  const out: Partial<Record<ComposePillar, string>> = {}
  for (const p of pillars) {
    if ((COMPOSE_PILLARS as readonly string[]).includes(p.slug)) out[p.slug as ComposePillar] = p.id
  }
  return out
}

/** Insert a sequence of child blocks under `parentId`, in order. */
/**
 * Insert a phase's composed children, in order.
 *
 * 🔴 THE `{ error }` IS READ, AND THAT IS THE POINT (LIVE-173). Every insert here used to be
 * awaited with its result discarded, so a Vera composition whose practice rows never landed still
 * returned `aiUsed: true` and the author was dropped into an editor missing the very rows the
 * compose run had just promised them. Nothing anywhere recorded it.
 *
 * The loop still does NOT abort on a failure, and that is deliberate rather than an oversight: the
 * rows are independent slots (four Pillars plus extra credit), so one refused insert must not cost
 * the four that would have succeeded. What changes is that a dropped row is now a queryable line
 * keyed by plan and parent instead of silence. `journeys.compose_child_failed` is the event to
 * alert on, and it shares the shape of create-actions' `journeys.seed_failed`.
 */
export async function insertChildren(admin: AdminDb, planId: string, parentId: string, rows: ComposedRow[]): Promise<void> {
  let sort = 0
  for (const row of rows) {
    const { error } = await admin
      .from('journey_plan_items')
      .insert({ ...row, plan_id: planId, parent_id: parentId, sort_order: sort++ })
    if (error) {
      log.error('journeys.compose_child_failed', {
        planId,
        parentId,
        blockType: row.block_type,
        title: row.title,
        error: error.message,
      })
    }
  }
}

/** Compatibility name: read-only planning questions; no model-generated blocks or names. */
export async function composeIntoPhase(input: {
  admin: AdminDb
  planId: string
  phaseId: string
  description: string
  profileId?: string | null
}): Promise<{ aiUsed: boolean; title: null; questions: string[] }> {
  const result = await draftJourneyComposition({ description: input.description, library: { mind: [], body: [], spirit: [], expression: [] }, profileId: input.profileId })
  return { aiUsed: !!result, title: null, questions: result?.questions ?? [...WRITING_COACHING_FALLBACK] }
}

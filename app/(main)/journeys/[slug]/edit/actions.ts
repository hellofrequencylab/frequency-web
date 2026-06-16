'use server'

// Journeys v2 — structure editor actions (ADR-252, J4b). Author-only CRUD over the block tree:
// add phases + lessons, edit a lesson's title/body/type/required, reorder among siblings, and
// delete (children cascade via the parent_id FK). Direct admin-client writes behind the
// author guard; the v2 block types (phase/module + leaf types) need the J0 migration applied.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { getPlan } from '@/lib/journey-plans'
import { draftJourneyOutline } from '@/lib/ai/journey-outline'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'

type BlockUpdate = Database['public']['Tables']['journey_plan_items']['Update']

// Typed admin handle — the v2 block columns (block_type/parent_id/body) are in the generated
// types as of ADR-253 step 5.
function db() {
  return createAdminClient()
}

const LEAF_TYPES = ['lesson', 'video', 'reading', 'exercise', 'reflection', 'check', 'resource'] as const

async function authorPlan(slug: string): Promise<{ planId: string; profileId: string } | null> {
  const caller = await getCallerProfile()
  if (!caller) return null
  const loaded = await getPlan(slug)
  if (!loaded) return null
  // The author, or an operator (admin.access) managing any Journey in the library.
  if (loaded.plan.author_id === caller.id) return { planId: loaded.plan.id, profileId: caller.id }
  if ((await getGlobalCapabilities()).has('admin.access')) return { planId: loaded.plan.id, profileId: caller.id }
  return null
}

async function nextSortOrder(
  admin: ReturnType<typeof createAdminClient>,
  planId: string,
  parentId: string | null,
): Promise<number> {
  let q = admin.from('journey_plan_items').select('sort_order').eq('plan_id', planId)
  q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null)
  const { data } = await q.order('sort_order', { ascending: false }).limit(1)
  return ((data?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1
}

function done(slug: string): void {
  revalidatePath(`/journeys/${slug}/edit`)
  revalidatePath(`/journeys/${slug}/learn`)
}

export async function addPhaseAction(slug: string): Promise<ActionResult<{ id: string }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const admin = db()
  const sort = await nextSortOrder(admin, a.planId, null)
  const { data, error } = await admin
    .from('journey_plan_items')
    .insert({ plan_id: a.planId, block_type: 'phase', parent_id: null, title: 'New phase', sort_order: sort, required: true })
    .select('id')
    .maybeSingle()
  if (error || !data) return fail('Could not add the phase.')
  done(slug)
  return ok({ id: String((data as { id: string }).id) })
}

/** Add a Module container under a Phase (build item §11.1 #3) — lets long Journeys group
 *  lessons into sessions within a phase. The player/tree already render Phase → Module → Lesson. */
/** Vera drafts a Phase -> Lesson outline from a one-line description and inserts it (build item
 *  §11.1 #4). The blank-with-prompts authoring path. Degrades to a clear error if AI is off. */
export async function draftOutlineAction(slug: string, description: string): Promise<ActionResult<{ phases: number }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const desc = description.trim().slice(0, 2000)
  if (!desc) return fail('Add a short description first.')
  const outline = await draftJourneyOutline({ description: desc, profileId: a.profileId })
  if (!outline) return fail('Vera could not draft an outline right now. Try again, or add phases by hand.')

  const admin = db()
  let sort = await nextSortOrder(admin, a.planId, null)
  for (const phase of outline.phases) {
    const { data: ph } = await admin
      .from('journey_plan_items')
      .insert({ plan_id: a.planId, block_type: 'phase', parent_id: null, title: phase.title, sort_order: sort++, required: true })
      .select('id')
      .maybeSingle()
    if (!ph) continue
    const phaseId = String((ph as { id: string }).id)
    let ls = 0
    for (const lesson of phase.lessons) {
      await admin
        .from('journey_plan_items')
        .insert({ plan_id: a.planId, block_type: lesson.type, parent_id: phaseId, title: lesson.title, sort_order: ls++, required: true })
    }
  }
  done(slug)
  return ok({ phases: outline.phases.length })
}

export async function addModuleAction(slug: string, phaseId: string): Promise<ActionResult<{ id: string }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const admin = db()
  const sort = await nextSortOrder(admin, a.planId, phaseId)
  const { data, error } = await admin
    .from('journey_plan_items')
    .insert({ plan_id: a.planId, block_type: 'module', parent_id: phaseId, title: 'New module', sort_order: sort, required: true })
    .select('id')
    .maybeSingle()
  if (error || !data) return fail('Could not add the module.')
  done(slug)
  return ok({ id: String((data as { id: string }).id) })
}

export async function addLessonAction(
  slug: string,
  parentId: string | null,
  blockType: string,
): Promise<ActionResult<{ id: string }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const type = (LEAF_TYPES as readonly string[]).includes(blockType) ? blockType : 'lesson'
  const admin = db()
  const sort = await nextSortOrder(admin, a.planId, parentId)
  const { data, error } = await admin
    .from('journey_plan_items')
    .insert({ plan_id: a.planId, block_type: type, parent_id: parentId, title: 'New lesson', sort_order: sort, required: true })
    .select('id')
    .maybeSingle()
  if (error || !data) return fail('Could not add the lesson.')
  done(slug)
  return ok({ id: String((data as { id: string }).id) })
}

/** Add a library practice as an optional block under a phase (ADR-252: practices demoted to
 *  one block type). Pulls the practice's title for the step label; the player renders it like
 *  any leaf, and check-offs use the same journey_lesson_progress as every other block. */
export async function addPracticeBlockAction(
  slug: string,
  parentId: string | null,
  practiceId: string,
): Promise<ActionResult<{ id: string }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  if (!practiceId) return fail('No practice given.')
  const admin = db()
  const { data: pr } = await admin.from('practices').select('title, domain_id').eq('id', practiceId).maybeSingle()
  const practice = pr as { title: string | null; domain_id: string | null } | null
  const sort = await nextSortOrder(admin, a.planId, parentId)
  const { data, error } = await admin
    .from('journey_plan_items')
    .insert({
      plan_id: a.planId,
      block_type: 'practice',
      parent_id: parentId,
      practice_id: practiceId,
      domain_id: practice?.domain_id ?? null,
      title: practice?.title ?? 'Practice',
      sort_order: sort,
      required: true,
    })
    .select('id')
    .maybeSingle()
  if (error || !data) return fail('Could not add the practice.')
  done(slug)
  return ok({ id: String((data as { id: string }).id) })
}

export async function updateBlockAction(
  slug: string,
  itemId: string,
  patch: {
    title?: string
    body?: string
    blockType?: string
    required?: boolean
    /** Knowledge-check config for `check` blocks (build item §11.1 #2); null clears it. */
    check?: { question: string; options: string[]; answer: number; explanation?: string | null } | null
  },
): Promise<ActionResult> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const update: BlockUpdate = {}
  if (patch.title !== undefined) update.title = patch.title.slice(0, 200)
  if (patch.body !== undefined) update.body = patch.body.slice(0, 20000)
  if (patch.required !== undefined) update.required = patch.required
  if (patch.blockType !== undefined && (LEAF_TYPES as readonly string[]).includes(patch.blockType)) update.block_type = patch.blockType
  if (patch.check !== undefined) {
    // `settings` on a check block holds only the check, so a whole-object write is safe here.
    if (patch.check === null) update.settings = {}
    else {
      const options = patch.check.options.map((o) => String(o).slice(0, 300)).slice(0, 6)
      const answer = Math.min(Math.max(0, Math.floor(patch.check.answer)), Math.max(0, options.length - 1))
      update.settings = {
        check: {
          question: String(patch.check.question).slice(0, 500),
          options,
          answer,
          explanation: patch.check.explanation ? String(patch.check.explanation).slice(0, 500) : null,
        },
      }
    }
  }
  if (Object.keys(update).length === 0) return ok()
  const { error } = await db().from('journey_plan_items').update(update).eq('id', itemId).eq('plan_id', a.planId)
  if (error) return fail('Could not save.')
  done(slug)
  return ok()
}

export async function removeBlockAction(slug: string, itemId: string): Promise<ActionResult> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const { error } = await db().from('journey_plan_items').delete().eq('id', itemId).eq('plan_id', a.planId)
  if (error) return fail('Could not delete.')
  done(slug)
  return ok()
}

/** Reorder a block among its siblings by swapping sort_order with its neighbor. */
export async function moveBlockAction(slug: string, itemId: string, dir: 'up' | 'down'): Promise<ActionResult> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const admin = db()
  const { data: self } = await admin.from('journey_plan_items').select('id, parent_id, sort_order').eq('id', itemId).eq('plan_id', a.planId).maybeSingle()
  const s = self as { id: string; parent_id: string | null; sort_order: number } | null
  if (!s) return fail('Not found.')
  let q = admin.from('journey_plan_items').select('id, sort_order').eq('plan_id', a.planId)
  q = s.parent_id ? q.eq('parent_id', s.parent_id) : q.is('parent_id', null)
  const { data: sibs } = await q.order('sort_order', { ascending: true })
  const list = (sibs ?? []) as { id: string; sort_order: number }[]
  const idx = list.findIndex((x) => x.id === itemId)
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return ok() // already at the edge
  const neighbor = list[swapIdx]
  await admin.from('journey_plan_items').update({ sort_order: neighbor.sort_order }).eq('id', s.id)
  await admin.from('journey_plan_items').update({ sort_order: s.sort_order }).eq('id', neighbor.id)
  done(slug)
  return ok()
}

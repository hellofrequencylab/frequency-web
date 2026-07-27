'use server'

// Journeys — guided creation wizard actions (ADR-839). The guide's three post-creation
// phases (Shape · Schedule · Ready) save through here. Two rules hold everywhere:
//   • SINGLE SOURCE OF TRUTH: content lands on the plan row + journey_plan_items (the same
//     rows the editor edits); the wizard entry in page_config carries ONLY progress/choices.
//   • Publishing is NOT here: the Ready phase calls the existing setJourneyVisibility
//     chokepoint, so the free-vs-paid publish lever lives in exactly one place.
// Every action re-checks canEditJourney server-side (the client is never trusted).

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { canEditJourney } from '@/lib/journeys/authoring'
import { updatePlan, setPlanWindow, type PageWidgetConfig } from '@/lib/journey-plans'
import { getTemplate, templateToBlocks, MASTER_FRAMEWORK_ID, masterFrameworkToBlocks } from '@/lib/journeys/templates'
import { pillarIdsBySlug } from '@/lib/journeys/compose'
import {
  readWizardState,
  writeWizardState,
  markPhaseComplete,
  newWizardState,
  isGuidePhase,
  type GuidePhase,
} from '@/lib/journeys/wizard'

/** The caller may edit this Journey (author / operator / Space manager), else null. */
async function assertEditor(planId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  return (await canEditJourney(planId, profileId)) ? profileId : null
}

/** Read the stored page_config for one plan (the wizard entry rides in it). */
async function loadPageConfig(planId: string): Promise<PageWidgetConfig[] | null> {
  const { data } = await createAdminClient()
    .from('journey_plans')
    .select('page_config')
    .eq('id', planId)
    .maybeSingle()
  return ((data as { page_config: PageWidgetConfig[] | null } | null)?.page_config ?? null)
}

function revalidateGuide(slug: string): void {
  revalidatePath(`/journeys/${slug}/guide`)
  revalidatePath(`/journeys/${slug}/edit`)
}

/** Mark one guide phase complete (the Continue press / the publish). Progress only —
 *  the phase's actual content was already saved to the row by its own action. */
export async function saveGuideProgressAction(
  planId: string,
  slug: string,
  complete: GuidePhase,
): Promise<ActionResult> {
  if (!(await assertEditor(planId))) return fail('Not allowed.')
  if (!isGuidePhase(complete)) return fail('Not a guide phase.')
  const stored = await loadPageConfig(planId)
  const next = markPhaseComplete(readWizardState(stored), complete)
  await updatePlan(planId, { pageConfig: writeWizardState(stored, next) })
  revalidateGuide(slug)
  return ok()
}

/**
 * Shape phase: stamp a template's block tree into THIS (still empty) plan — the same
 * skeletons /journeys/new instantiates, but applied to an existing draft so a member who
 * skipped the picker can still start from a proven structure. Refuses when the plan
 * already has phases (the guide offers the editor for reshaping, never a silent wipe).
 */
export async function applyGuideTemplateAction(
  planId: string,
  slug: string,
  templateId: string,
): Promise<ActionResult> {
  if (!(await assertEditor(planId))) return fail('Not allowed.')

  const admin = createAdminClient()
  const { count } = await admin
    .from('journey_plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
    .eq('block_type', 'phase')
  if ((count ?? 0) > 0) return fail('This Journey already has phases. Reshape it in the editor.')

  // Flatten the chosen skeleton to ordered rows (parents before children), then insert in
  // order, resolving each temp id to the real inserted id — the same walk the create flow does.
  type InsertRow = Database['public']['Tables']['journey_plan_items']['Insert']
  let rows: { tempId: string; parentTempId: string | null; insert: Omit<InsertRow, 'plan_id' | 'parent_id'> }[]
  if (templateId === MASTER_FRAMEWORK_ID) {
    const pillarIds = await pillarIdsBySlug()
    rows = masterFrameworkToBlocks(pillarIds).map((b) => ({
      tempId: b.tempId,
      parentTempId: b.parentTempId,
      insert:
        b.block.kind === 'phase'
          ? ({ block_type: 'phase', title: b.block.title, body: b.block.body, sort_order: b.sortOrder, required: true } as Omit<InsertRow, 'plan_id' | 'parent_id'>)
          : ({ ...b.block.row, sort_order: b.sortOrder } as unknown as Omit<InsertRow, 'plan_id' | 'parent_id'>),
    }))
  } else {
    const template = getTemplate(templateId)
    if (!template) return fail('That template is gone. Pick another.')
    rows = templateToBlocks(template).map((b) => ({
      tempId: b.tempId,
      parentTempId: b.parentTempId,
      insert: { block_type: b.blockType, title: b.title, sort_order: b.sortOrder, required: true } as Omit<InsertRow, 'plan_id' | 'parent_id'>,
    }))
  }

  const idMap = new Map<string, string>()
  for (const r of rows) {
    const { data } = await admin
      .from('journey_plan_items')
      .insert({
        ...r.insert,
        plan_id: planId,
        parent_id: r.parentTempId ? idMap.get(r.parentTempId) ?? null : null,
      } as InsertRow)
      .select('id')
      .maybeSingle()
    const realId = (data as { id: string } | null)?.id
    if (realId) idMap.set(r.tempId, realId)
  }

  // Record the choice on the wizard state (progress metadata, not content).
  const stored = await loadPageConfig(planId)
  const state = readWizardState(stored) ?? newWizardState()
  await updatePlan(planId, {
    pageConfig: writeWizardState(stored, {
      ...state,
      choices: { ...state.choices, templateId },
      updatedAt: new Date().toISOString(),
    }),
  })

  revalidateGuide(slug)
  revalidatePath(`/journeys/${slug}/learn`)
  return ok()
}

/**
 * Schedule phase: the run window (journey_plans.window_starts_at/ends_at) + the phase drip
 * cadence (drip_interval_days), saved together and the phase marked complete. Any author who
 * can edit the Journey may set these here (the Quest play-window control in the editor's
 * Advanced panel stays Guide/Mentor territory; these columns are the shared substrate).
 */
export async function saveGuideScheduleAction(
  planId: string,
  slug: string,
  input: { startsAt: string | null; endsAt: string | null; dripIntervalDays: number },
): Promise<ActionResult> {
  if (!(await assertEditor(planId))) return fail('Not allowed.')
  await setPlanWindow(planId, { startsAt: input.startsAt, endsAt: input.endsAt })
  await updatePlan(planId, { dripIntervalDays: input.dripIntervalDays })

  const stored = await loadPageConfig(planId)
  const next = markPhaseComplete(readWizardState(stored), 'schedule')
  await updatePlan(planId, { pageConfig: writeWizardState(stored, next) })

  revalidateGuide(slug)
  revalidatePath(`/journeys/${slug}/learn`)
  return ok()
}

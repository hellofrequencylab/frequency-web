'use server'

// Journeys v2 — create from a template or blank (ADR-252, J4). Starting from a proven
// structure (not a blank page) is the highest-leverage authoring feature (JOURNEYS.md §10):
// instantiate the template's Phase → Module → Lesson skeleton into a new private journey, then
// drop the author into the player to refine. Author = the caller.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPlan } from '@/lib/journey-plans'
import { getTemplate, templateToBlocks } from '@/lib/journeys/templates'

/** Deferred creation (no untitled drafts): a Journey row is created ONLY once the author commits a
 *  title from the single-page editor. Seeds 3 empty phases so the curriculum opens ready to edit,
 *  then drops the author into the editor. */
export async function createJourneyDraftAction(title: string): Promise<void> {
  const caller = await getCallerProfile()
  if (!caller) redirect('/journeys')
  const clean = title.trim().slice(0, 120)
  if (!clean) redirect('/journeys/new')

  const plan = await createPlan({ authorId: caller.id, title: clean })
  if (!plan) redirect('/journeys')

  // Three phase boxes, ready to edit (the author fills them, or rebuilds with Vera).
  const admin = createAdminClient()
  await admin.from('journey_plan_items').insert(
    [0, 1, 2].map((i) => ({
      plan_id: plan.id,
      block_type: 'phase',
      parent_id: null,
      title: `Phase ${i + 1}`,
      sort_order: i,
      required: true,
    })),
  )

  redirect(`/journeys/${plan.slug}/edit`)
}

export async function createJourneyFromTemplateAction(templateId: string | null): Promise<void> {
  const caller = await getCallerProfile()
  if (!caller) redirect('/journeys')

  const template = templateId ? getTemplate(templateId) : null
  const plan = await createPlan({
    authorId: caller.id,
    title: template ? template.name : 'Untitled journey',
    emoji: template?.emoji ?? null,
  })
  if (!plan) redirect('/journeys')

  if (template) {
    const admin = createAdminClient()
    const idMap = new Map<string, string>()
    // Insert in order (parents before children) so each parent_id resolves to a real id.
    for (const b of templateToBlocks(template)) {
      const { data } = await admin
        .from('journey_plan_items')
        .insert({
          plan_id: plan.id,
          block_type: b.blockType,
          parent_id: b.parentTempId ? idMap.get(b.parentTempId) ?? null : null,
          title: b.title,
          sort_order: b.sortOrder,
          required: true,
        })
        .select('id')
        .maybeSingle()
      const realId = (data as { id: string } | null)?.id
      if (realId) idMap.set(b.tempId, realId)
    }
  }

  redirect(`/journeys/${plan.slug}/learn`)
}

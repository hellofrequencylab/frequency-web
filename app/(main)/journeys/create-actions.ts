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

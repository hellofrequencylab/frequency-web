'use server'

// Journeys v2 — create from a template or blank (ADR-252, J4). Starting from a proven
// structure (not a blank page) is the highest-leverage authoring feature (JOURNEYS.md §10):
// instantiate the template's Phase → Module → Lesson skeleton into a new private journey, then
// drop the author into the player to refine. Author = the caller.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPlan } from '@/lib/journey-plans'
import { getTemplate, templateToBlocks } from '@/lib/journeys/templates'
import { draftJourneySpark, type SparkAnswers, type JourneySpark, type ArcWeek } from '@/lib/ai/journey-spark'
import { composeJourneyAction } from '@/app/(main)/journeys/[slug]/edit/actions'

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

// ── Guided builder (ADR-302) ────────────────────────────────────────────────────────────
// Step 1 "Spark": Vera drafts the identity from the onboarding answers (no row created yet — the
// author reviews the draft first). Step 1 commit: create the row with that identity + seed one
// weekly Phase per week (the arc), then drop into the editor where Vera fills the practices.

/** Vera drafts the Journey identity from the spark answers. Returns the draft for the author to
 *  review/edit; creates nothing. Null-safe: when Vera is offline, the wizard lets them type it. */
export async function sparkJourneyAction(answers: SparkAnswers): Promise<ActionResult<JourneySpark>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to build a Journey.')
  const spark = await draftJourneySpark({ ...answers, profileId: caller.id })
  if (!spark) return fail('Vera is offline right now. Name it yourself and keep going.')
  return ok(spark)
}

/** Create the Journey from the reviewed identity, seed N weekly Phases, AND pre-seed the opening
 *  week's four Pillar practices from the library off the interview answers (Vera interviews the host
 *  and pre-seeds the whole format for them to tweak — ADR-302). The deferred-creation rule holds:
 *  a row exists only once the author commits a (reviewed) title here. */
export async function createJourneyFromSparkAction(input: {
  title: string
  promise: string
  overview: string
  answers: SparkAnswers
  arc: ArcWeek[]
}): Promise<void> {
  const caller = await getCallerProfile()
  if (!caller) redirect('/journeys')
  const title = input.title.trim().slice(0, 120)
  if (!title) redirect('/journeys/new')

  const plan = await createPlan({ authorId: caller.id, title, summary: input.promise.trim().slice(0, 280) || null })
  if (!plan) redirect('/journeys')

  const admin = createAdminClient()
  const overview = input.overview.trim().slice(0, 8000)
  if (overview) await admin.from('journey_plans').update({ intro: overview }).eq('id', plan.id)

  // One Phase per week, titled + described by Vera's weekly ARC (so every week is filled with a
  // focus, not an empty "Week N"). Falls back to a plain week label when the arc is missing.
  const a = input.answers
  const weeks = Math.min(12, Math.max(1, Math.floor(a.weeks) || 4))
  const arc = input.arc ?? []
  await admin.from('journey_plan_items').insert(
    Array.from({ length: weeks }, (_, i) => ({
      plan_id: plan.id,
      block_type: 'phase',
      parent_id: null,
      title: arc[i]?.title ? `Week ${i + 1}: ${arc[i].title}` : `Week ${i + 1}`,
      body: arc[i]?.focus?.trim() || null,
      sort_order: i,
      required: true,
    })),
  )

  // Pre-seed the opening week's four Pillar practices (library picks + write-ups) from the
  // interview — composeJourneyAction fills the first empty phase (Week 1). Best-effort: a Journey
  // is still usable if Vera is offline (the author fills the practices in the editor).
  const description = `A ${weeks}-week Journey for ${a.who.trim() || 'anyone'}. About: ${a.topic.trim() || 'general wellbeing'}. People should walk away with: ${a.outcome.trim() || 'a steadier week'}. Daily time: ${a.pace}.`
  try {
    await composeJourneyAction(plan.slug, description)
  } catch {
    /* best-effort pre-seed */
  }

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

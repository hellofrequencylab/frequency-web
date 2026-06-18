'use server'

// Journeys v2 — create from a template or blank (ADR-252, J4). Starting from a proven
// structure (not a blank page) is the highest-leverage authoring feature (JOURNEYS.md §10):
// instantiate the template's Phase → Module → Lesson skeleton into a new private journey, then
// drop the author into the editor to refine. Author = the caller.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { createPlan } from '@/lib/journey-plans'
import { getTemplate, templateToBlocks, MASTER_FRAMEWORK, masterFrameworkToBlocks } from '@/lib/journeys/templates'
import { pillarIdsBySlug } from '@/lib/journeys/compose'
import { draftJourneySpark, type SparkAnswers, type JourneySpark, type ArcWeek, type SparkSettings, type SparkMeeting } from '@/lib/ai/journey-spark'
import { normalizeJourneyMeeting } from '@/lib/journey-plans'
import { composeJourneyAction } from '@/app/(main)/journeys/[slug]/edit/actions'
import { composeIntoPhase } from '@/lib/journeys/compose'
import { extractOverviewText } from '@/lib/journeys/extract-text'

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
export async function sparkJourneyAction(answers: SparkAnswers, sourceText?: string): Promise<ActionResult<JourneySpark>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to build a Journey.')
  const spark = await draftJourneySpark({ ...answers, sourceText, profileId: caller.id })
  if (!spark) return fail('Vera is offline right now. Name it yourself and keep going.')
  return ok(spark)
}

/** Pull plain text out of an uploaded course write-up (PDF / Word / plain text) so the author can
 *  drop in their own overview and have Vera rebuild it (ADR-302). Returns the extracted text. */
export async function extractOverviewAction(formData: FormData): Promise<ActionResult<{ text: string }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')
  const file = formData.get('file')
  if (!(file instanceof File)) return fail('No file to read.')
  if (file.size > 5 * 1024 * 1024) return fail('That file is over 5 MB. Trim it or paste the text instead.')
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const text = await extractOverviewText(buf, file.type, file.name)
    if (!text) return fail("Couldn't read any text from that file. Try plain text, or paste it instead.")
    return ok({ text: text.slice(0, 20000) })
  } catch {
    return fail("Couldn't read that file. Try plain text, or paste the overview instead.")
  }
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
  /** Settings Vera lifted from the uploaded outline (difficulty/category/tags/daily minutes). */
  settings?: SparkSettings
  /** How the Circle meets, confirmed/edited on review (lifted from the outline, or set by hand). */
  meeting?: Partial<SparkMeeting>
  /** The author's pasted/uploaded overview, when they built from a document. */
  sourceText?: string
}): Promise<void> {
  const caller = await getCallerProfile()
  if (!caller) redirect('/journeys')
  const title = input.title.trim().slice(0, 120)
  if (!title) redirect('/journeys/new')

  const plan = await createPlan({ authorId: caller.id, title, summary: input.promise.trim().slice(0, 280) || null })
  if (!plan) redirect('/journeys')

  const admin = createAdminClient()
  const a = input.answers
  const source = input.sourceText?.trim()

  // Identity + settings in one write: the overview, the author's outline (kept so Vera can read it
  // when populating EVERY week, not just the first), and the settings Vera lifted from the outline
  // (difficulty/category/tags). Daily minutes come from the outline, else the chosen pace.
  const overview = input.overview.trim().slice(0, 8000)
  const s = input.settings
  const planUpdate: Record<string, unknown> = {
    daily_minutes: s?.dailyMinutes ?? (a.pace === 'medium' ? 15 : 5),
  }
  if (overview) planUpdate.intro = overview
  if (source) planUpdate.source_overview = source.slice(0, 20000)
  if (s?.difficulty) planUpdate.difficulty = s.difficulty
  if (s?.category) planUpdate.category = s.category
  if (s?.tags?.length) planUpdate.tags = s.tags
  // Meeting / format (ADR-302): normalize what Vera lifted (or the author confirmed) into a clean
  // JourneyMeeting and only write it when something is set, so an unset Journey keeps the column's
  // {} default. normalizeJourneyMeeting drops empties to null, so we test for any real value.
  const meeting = normalizeJourneyMeeting(input.meeting ?? {})
  if (meeting.format || meeting.schedule || meeting.timezone || meeting.location || meeting.link || meeting.notes) {
    planUpdate.meeting = meeting
  }
  // difficulty/category/tags/daily_minutes aren't in the generated types yet — cast the payload
  // (ADR-246: cast the payload, never the admin client). source_overview was added to the types.
  await admin
    .from('journey_plans')
    .update(planUpdate as unknown as Database['public']['Tables']['journey_plans']['Update'])
    .eq('id', plan.id)

  // One Phase per week, titled + described by Vera's weekly ARC (so every week is filled with a
  // focus, not an empty "Week N"). Falls back to a plain week label when the arc is missing.
  const weeks = Math.min(12, Math.max(1, Math.floor(a.weeks) || 4))
  const arc = input.arc ?? []
  const { data: phaseRows } = await admin
    .from('journey_plan_items')
    .insert(
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
    .select('id, sort_order')
  const phases = ((phaseRows ?? []) as { id: string; sort_order: number }[]).sort((x, y) => x.sort_order - y.sort_order)

  if (source) {
    // Built from a document: populate EVERY week from the outline (not just the opening one), each
    // grounded in that week's focus + the practices already used earlier so weeks don't repeat.
    // Sequential + best-effort: each phase commits before the next, so a slow/offline run still
    // leaves the completed weeks intact (the rest stay one outline-aware click away in the editor).
    const usedTitles: string[] = []
    for (let i = 0; i < phases.length; i++) {
      const w = arc[i]
      const focus = w?.title ? `Week ${i + 1}: ${w.title}${w.focus ? `. ${w.focus}` : ''}` : `Week ${i + 1}`
      const description = [
        `Compose this week's four Pillar practices so they fit this week's focus and follow the author's outline.`,
        `This week's focus: ${focus}.`,
        usedTitles.length ? `Practices already used in earlier weeks (do not repeat): ${usedTitles.join('; ')}.` : '',
        `The author's own course outline follows. Follow it closely and use the practices it names for THIS week where it gives them:\n"""\n${source.slice(0, 4000)}\n"""`,
      ]
        .filter(Boolean)
        .join(' ')
      try {
        await composeIntoPhase({ admin, planId: plan.id, phaseId: phases[i].id, description, profileId: caller.id })
        const { data: kids } = await admin
          .from('journey_plan_items')
          .select('title')
          .eq('parent_id', phases[i].id)
          .eq('block_type', 'practice')
        for (const k of (kids ?? []) as { title: string | null }[]) if (k.title) usedTitles.push(k.title)
      } catch {
        /* best-effort: a failed week stays empty and fillable in the editor */
      }
    }
  } else {
    // Questions path: pre-seed only the opening week's four Pillar practices (the existing model);
    // the later weeks carry their arc focus and fill on demand. Best-effort.
    const description = `A ${weeks}-week Journey for ${a.who.trim() || 'anyone'}. About: ${a.topic.trim() || 'general wellbeing'}. People should walk away with: ${a.outcome.trim() || 'a steadier week'}. Daily time: ${a.pace}.`
    try {
      await composeJourneyAction(plan.slug, description)
    } catch {
      /* best-effort pre-seed */
    }
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

  redirect(`/journeys/${plan.slug}/edit`)
}

/** Stamp a new Journey to the recommended "Master Framework" shape — deterministic, no AI (ADR-302):
 *  an Onboarding phase (welcome + the anchor practice + an intro prompt), N week-Phases (the week's
 *  focus lesson + Mind/Body/Spirit practices + a light weekly Expression Challenge + a reflection),
 *  and a Close phase (the heavy capstone Expression Challenge + a final reflection). `fixed` holds
 *  the same weekly practices across every week instead of leaving distinct slots to fill (a
 *  scaffold-time choice, not a persisted flag). Gated to a signed-in member; returns the new slug so
 *  the caller can route into the editor. */
export async function createMasterFrameworkAction(input: {
  title?: string
  weeks?: number
  fixed?: boolean
}): Promise<ActionResult<{ slug: string }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to build a Journey.')

  const title = input.title?.trim().slice(0, 120) || MASTER_FRAMEWORK.name
  const plan = await createPlan({ authorId: caller.id, title, emoji: MASTER_FRAMEWORK.emoji })
  if (!plan) return fail('Could not create the Journey. Try again in a moment.')

  // Resolve real Pillar ids the way the composer does, then stamp the framework's blocks in order
  // (parents before children) so each child's parent_id resolves to a real inserted id.
  const pillarIds = await pillarIdsBySlug()
  const admin = createAdminClient()
  const idMap = new Map<string, string>()
  for (const b of masterFrameworkToBlocks(pillarIds, { weeks: input.weeks, fixed: input.fixed })) {
    const parentId = b.parentTempId ? idMap.get(b.parentTempId) ?? null : null
    const insert =
      b.block.kind === 'phase'
        ? { plan_id: plan.id, block_type: 'phase' as const, parent_id: parentId, title: b.block.title, body: b.block.body, sort_order: b.sortOrder, required: true }
        : { ...b.block.row, plan_id: plan.id, parent_id: parentId, sort_order: b.sortOrder }
    const { data } = await admin
      .from('journey_plan_items')
      .insert(insert as unknown as Database['public']['Tables']['journey_plan_items']['Insert'])
      .select('id')
      .maybeSingle()
    const realId = (data as { id: string } | null)?.id
    if (realId) idMap.set(b.tempId, realId)
  }

  return ok({ slug: plan.slug })
}

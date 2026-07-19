'use server'

// Journeys v2 — create from a template or blank (ADR-252, J4). Starting from a proven
// structure (not a blank page) is the highest-leverage authoring feature (JOURNEYS.md §10):
// instantiate the template's Phase → Module → Lesson skeleton into a new private journey, then
// drop the author into the editor to refine. Author = the caller.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { canCreate } from '@/lib/core/load-capabilities'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { createPlan } from '@/lib/journey-plans'
import { crewCreateUpsell } from '@/lib/core/beta-notices'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getTemplate, templateToBlocks, MASTER_FRAMEWORK, masterFrameworkToBlocks } from '@/lib/journeys/templates'
import { pillarIdsBySlug } from '@/lib/journeys/compose'
import { draftJourneySpark, type SparkAnswers, type JourneySpark, type ArcWeek, type SparkSettings, type SparkMeeting } from '@/lib/ai/journey-spark'
import { normalizeJourneyMeeting } from '@/lib/journey-plans'
import { composeJourneyAction } from '@/app/(main)/journeys/[slug]/edit/actions'
import { composeIntoPhase } from '@/lib/journeys/compose'
import { extractOverviewText } from '@/lib/journeys/extract-text'

/**
 * Resolve WHO is creating a Journey and WHICH owner it is stamped to, applying the right gate:
 *  - No `spaceSlug` (the personal `/journeys/new` flow): the author is the caller, gated on the
 *    personal `journey.create` capability (real Crew / staff), and the Journey is personal (root).
 *  - A `spaceSlug` (the SAME flow reached from a Space's manager): the author is the caller, gated on
 *    MANAGING that Space (owner / admin / editor — canEditProfile), NOT the member tier, and the
 *    Journey is stamped to that Space. So a free member who runs a Space can build for their members.
 * Returns the author id + owning space id (null = personal/root), or an error string.
 */
async function resolveCreateContext(
  spaceSlug?: string | null,
): Promise<{ authorId: string; spaceId: string | null } | { error: string }> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Sign in to build a Journey.' }
  if (spaceSlug) {
    const space = await getVisibleSpaceBySlug(spaceSlug, caller.id)
    if (!space) return { error: 'Space not found.' }
    const caps = await getSpaceCapabilities(space, caller.id)
    if (!caps.canEditProfile) return { error: 'You do not manage this space.' }
    return { authorId: caller.id, spaceId: space.id }
  }
  if (!(await canCreate('journey.create'))) return { error: crewCreateUpsell('a Journey') }
  return { authorId: caller.id, spaceId: null }
}

/** Where a failed create redirects back to: the Space's Journeys manager, else the library. */
function createFallback(spaceSlug?: string | null): string {
  return spaceSlug ? `/spaces/${spaceSlug}/journeys` : '/journeys'
}

/** Deferred creation (no untitled drafts): a Journey row is created ONLY once the author commits a
 *  title from the single-page editor. Seeds 3 empty phases so the curriculum opens ready to edit,
 *  then drops the author into the editor. `spaceSlug` stamps the Journey to a Space (the Space
 *  manager's "New journey" reaches this same flow); omitted, it is a personal Journey. */
export async function createJourneyDraftAction(title: string, spaceSlug?: string | null): Promise<void> {
  const ctx = await resolveCreateContext(spaceSlug)
  if ('error' in ctx) redirect(createFallback(spaceSlug))
  const clean = title.trim().slice(0, 120)
  if (!clean) redirect(spaceSlug ? createFallback(spaceSlug) : '/journeys/new')

  const plan = await createPlan({ authorId: ctx.authorId, title: clean, spaceId: ctx.spaceId })
  if (!plan) redirect(createFallback(spaceSlug))

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

/** Multi-file version (ADR-302, streamlined creator): read a WHOLE stack of course documents at once
 *  (the outline plus any supporting handouts) and hand Vera the combined text. Extracts each supported
 *  file (PDF, Word, plain text / markdown), concatenates them with a filename header so Vera can tell
 *  the pieces apart, and reports which files it could not read so the UI can say so honestly (a zip or
 *  an image is accepted by the picker but not text-extractable here). Bounded on count + total size. */
export async function extractOverviewFilesAction(
  formData: FormData,
): Promise<ActionResult<{ text: string; read: number; skipped: string[] }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')
  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (!files.length) return fail('No files to read.')

  const MAX_FILES = 12
  const MAX_TOTAL = 20 * 1024 * 1024 // 20 MB across the whole batch
  const parts: string[] = []
  const skipped: string[] = []
  let read = 0
  let total = 0

  for (const file of files.slice(0, MAX_FILES)) {
    total += file.size
    if (total > MAX_TOTAL) {
      skipped.push(`${file.name} (batch over 20 MB)`)
      continue
    }
    try {
      const buf = Buffer.from(await file.arrayBuffer())
      const text = await extractOverviewText(buf, file.type, file.name)
      if (text) {
        parts.push(`--- ${file.name} ---\n${text}`)
        read++
      } else {
        skipped.push(file.name)
      }
    } catch {
      skipped.push(file.name)
    }
  }
  if (files.length > MAX_FILES) skipped.push(`and ${files.length - MAX_FILES} more (limit ${MAX_FILES} files)`)

  const text = parts.join('\n\n').slice(0, 40000)
  if (!text) {
    return fail("Couldn't read any text from those files. Vera reads PDF, Word, and plain text.")
  }
  return ok({ text, read, skipped })
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
}, spaceSlug?: string | null): Promise<void> {
  const ctx = await resolveCreateContext(spaceSlug)
  if ('error' in ctx) redirect(createFallback(spaceSlug))
  const authorId = ctx.authorId
  const title = input.title.trim().slice(0, 120)
  if (!title) redirect(spaceSlug ? createFallback(spaceSlug) : '/journeys/new')

  const plan = await createPlan({ authorId, title, summary: input.promise.trim().slice(0, 280) || null, spaceId: ctx.spaceId })
  if (!plan) redirect(createFallback(spaceSlug))

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
        await composeIntoPhase({ admin, planId: plan.id, phaseId: phases[i].id, description, profileId: authorId })
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

export async function createJourneyFromTemplateAction(templateId: string | null, spaceSlug?: string | null): Promise<void> {
  const ctx = await resolveCreateContext(spaceSlug)
  if ('error' in ctx) redirect(createFallback(spaceSlug))

  const template = templateId ? getTemplate(templateId) : null
  const plan = await createPlan({
    authorId: ctx.authorId,
    title: template ? template.name : 'Untitled journey',
    emoji: template?.emoji ?? null,
    spaceId: ctx.spaceId,
  })
  if (!plan) redirect(createFallback(spaceSlug))

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
  /** Stamp the Journey to a Space (the Space manager's guided create); omitted, it is personal. */
  spaceSlug?: string | null
}): Promise<ActionResult<{ slug: string }>> {
  const ctx = await resolveCreateContext(input.spaceSlug)
  if ('error' in ctx) return fail(ctx.error)

  const title = input.title?.trim().slice(0, 120) || MASTER_FRAMEWORK.name
  const plan = await createPlan({ authorId: ctx.authorId, title, emoji: MASTER_FRAMEWORK.emoji, spaceId: ctx.spaceId })
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

'use server'

// Journeys v2 — structure editor actions (ADR-252, J4b). Author-only CRUD over the block tree:
// add phases + lessons, edit a lesson's title/body/type/required, reorder among siblings, and
// delete (children cascade via the parent_id FK). Direct admin-client writes behind the
// author guard; the v2 block types (phase/module + leaf types) need the J0 migration applied.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { ok, fail, isError, type ActionResult } from '@/lib/action-result'
import { getPlan } from '@/lib/journey-plans'
import { draftSlotCoaching } from '@/lib/ai/journey-slot-coaching'
import {
  draftJourneyComposition,
  COMPOSE_PILLARS,
  type ComposePillar,
  type ComposeCandidate,
} from '@/lib/ai/journey-composition'
import { planJourneyEdits, type JourneyForEdit } from '@/lib/ai/journey-edit'
import { getCurrentSeason } from '@/lib/seasons'
import { getPillars } from '@/lib/pillars'
import { searchLibraryPractices } from '@/lib/practices'
import { DEFAULT_EXTRA_CREDIT_ZAPS } from '@/lib/journeys/grants'
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

/** The phase Vera should fill: the FIRST EMPTY top-level phase (e.g. a Spark-seeded "Week 1"), so
 *  she fills the existing arc instead of stacking a new phase beside it. Falls back to a new phase
 *  when every phase already has content (or there are none). */
async function reuseOrCreatePhase(admin: ReturnType<typeof createAdminClient>, planId: string, title: string): Promise<string | null> {
  const { data: phases } = await admin
    .from('journey_plan_items')
    .select('id')
    .eq('plan_id', planId)
    .eq('block_type', 'phase')
    .is('parent_id', null)
    .order('sort_order', { ascending: true })
  for (const ph of (phases ?? []) as { id: string }[]) {
    const { count } = await admin
      .from('journey_plan_items')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', ph.id)
    if (!count) return ph.id
  }
  const sort = await nextSortOrder(admin, planId, null)
  const { data } = await admin
    .from('journey_plan_items')
    .insert({ plan_id: planId, block_type: 'phase', parent_id: null, title, sort_order: sort, required: true })
    .select('id')
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
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

/** Add an empty extra-credit Challenge under a phase (ADR-300 Part 2): a bonus, not-required task
 *  that pays bonus Zaps on completion. The author fills in the title/body and tunes the Zaps. */
export async function addExtraCreditAction(slug: string, parentId: string | null): Promise<ActionResult<{ id: string }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const admin = db()
  const sort = await nextSortOrder(admin, a.planId, parentId)
  const row = extraCreditRow(EXTRA_CREDIT_PLACEHOLDER.title, EXTRA_CREDIT_PLACEHOLDER.body)
  const { data, error } = await admin
    .from('journey_plan_items')
    .insert({ ...row, plan_id: a.planId, parent_id: parentId, sort_order: sort })
    .select('id')
    .maybeSingle()
  if (error || !data) return fail('Could not add the extra credit.')
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

/** Vera drafts a per-slot coaching line for a practice block (JOURNEYS.md §6), grounded in the
 *  season, the Journey's name, the practice, and its Pillar — generated dynamically on demand.
 *  Stores it on `settings.coaching_prompt`; the author can edit it after. Degrades to a clear
 *  error when AI is off so the author can write the line by hand. */
export async function draftSlotCoachingAction(
  slug: string,
  itemId: string,
): Promise<ActionResult<{ prompt: string }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const admin = db()
  const { data: row } = await admin
    .from('journey_plan_items')
    .select('title, block_type, domain_id')
    .eq('id', itemId)
    .eq('plan_id', a.planId)
    .maybeSingle()
  const slot = row as { title: string | null; block_type: string | null; domain_id: string | null } | null
  if (!slot) return fail('That step is no longer here.')

  // Pull the Journey name, the live season, and the slot's Pillar — the dynamic inputs Vera
  // grounds the prompt in.
  const [loaded, season] = await Promise.all([getPlan(slug), getCurrentSeason()])
  const pillars: string[] = []
  if (slot.domain_id) {
    const { data: pil } = await admin.from('pillars').select('name').eq('id', slot.domain_id).maybeSingle()
    const name = (pil as { name: string } | null)?.name
    if (name) pillars.push(name)
  }

  const prompt = await draftSlotCoaching({
    journeyTitle: loaded?.plan.title ?? '',
    practiceTitle: slot.title ?? 'this practice',
    pillars,
    season: season ? { name: season.name, theme: season.theme } : null,
    profileId: a.profileId,
  })
  if (!prompt) return fail('Vera could not draft a prompt right now. Try again, or write one yourself.')

  const { error } = await admin
    .from('journey_plan_items')
    .update({ settings: { coaching_prompt: prompt } })
    .eq('id', itemId)
    .eq('plan_id', a.planId)
  if (error) return fail('Could not save the prompt.')
  done(slug)
  return ok({ prompt })
}

// ── Vera Journey composer (JOURNEYS.md §6) ──────────────────────────────────────────────
//
// Every new Journey opens pre-propagated with a balanced shape: one practice per Pillar — Mind,
// Body, Spirit, and Expression. So a fresh Journey starts balanced across all four Pillars, and
// doing the practices feeds the four-Pillar Signature. The author tells Vera what they're making
// and she fills the shape (reusing fitting library practices or writing new ones), or starts from
// the empty shape and fills it by hand. Extra-credit Challenges (above-and-beyond bonus tasks that
// pay regular Zaps) and Side Quests (reward-only, badge-granting) are separate layers, not here.

const SCAFFOLD_PHASE = 'Your first week'

const PILLAR_SLOTS: { slug: ComposePillar; label: string; prompt: string }[] = [
  { slug: 'mind', label: 'Mind practice', prompt: 'A Mind practice to steady attention. Pick one from the library or let Vera draft it.' },
  { slug: 'body', label: 'Body practice', prompt: 'A Body practice that is physical and doable. Pick one from the library or let Vera draft it.' },
  { slug: 'spirit', label: 'Spirit practice', prompt: 'A Spirit practice that is reflective or connecting. Pick one from the library or let Vera draft it.' },
  { slug: 'expression', label: 'Expression practice', prompt: 'An Expression practice: make something, share something, or connect with someone. Pick one from the library or let Vera draft it.' },
]

const EXTRA_CREDIT_PLACEHOLDER = {
  title: 'Extra credit',
  body: 'An above-and-beyond bonus challenge. It is optional, and finishing it pays bonus Zaps.',
}

// An extra-credit block (ADR-300 Part 2): an `exercise` block that is NOT required (does not gate
// completion) and carries `settings.extra_credit` + `settings.bonus_zaps`. The player pays the
// bonus Zaps once on completion (lib/journeys/grants.ts). Not one of the four Pillar practices.
function extraCreditRow(title: string, body: string, zaps = DEFAULT_EXTRA_CREDIT_ZAPS): Omit<NewBlock, 'plan_id' | 'parent_id' | 'sort_order'> {
  return {
    block_type: 'exercise',
    title: title.slice(0, 200),
    body: body.slice(0, 2000),
    required: false,
    settings: { extra_credit: true, bonus_zaps: zaps },
  }
}

/** Pillar slug -> id, for tagging the scaffold's slots with their Pillar. */
async function pillarIdsBySlug(): Promise<Partial<Record<ComposePillar, string>>> {
  const pillars = await getPillars()
  const out: Partial<Record<ComposePillar, string>> = {}
  for (const p of pillars) {
    if ((COMPOSE_PILLARS as readonly string[]).includes(p.slug)) out[p.slug as ComposePillar] = p.id
  }
  return out
}

type AdminDb = ReturnType<typeof createAdminClient>
type NewBlock = Database['public']['Tables']['journey_plan_items']['Insert']

/** Insert a sequence of child blocks under `parentId`, in order. */
async function insertChildren(admin: AdminDb, planId: string, parentId: string, rows: Omit<NewBlock, 'plan_id' | 'parent_id' | 'sort_order'>[]): Promise<void> {
  let sort = 0
  for (const row of rows) {
    await admin.from('journey_plan_items').insert({ ...row, plan_id: planId, parent_id: parentId, sort_order: sort++ })
  }
}

/** Build the empty shape (a phase with the four Pillar slots — Mind/Body/Spirit practices + an
 *  Expression challenge), prompts in the body. The no-AI path, and the fallback when Vera is off. */
export async function scaffoldJourneyAction(slug: string): Promise<ActionResult<{ phaseId: string }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const admin = db()
  const pillarIds = await pillarIdsBySlug()
  const phaseId = await reuseOrCreatePhase(admin, a.planId, SCAFFOLD_PHASE)
  if (!phaseId) return fail('Could not start the journey shape.')

  const rows: Omit<NewBlock, 'plan_id' | 'parent_id' | 'sort_order'>[] = [
    ...PILLAR_SLOTS.map((s) => ({
      block_type: 'practice',
      title: s.label,
      body: s.prompt,
      domain_id: pillarIds[s.slug] ?? null,
      required: true,
    })),
    // One extra-credit slot (ADR-300 Part 2): seeded alongside the four Pillar practices.
    extraCreditRow(EXTRA_CREDIT_PLACEHOLDER.title, EXTRA_CREDIT_PLACEHOLDER.body),
  ]
  await insertChildren(admin, a.planId, phaseId, rows)
  done(slug)
  return ok({ phaseId })
}

/** Vera composes the opening week from a one-line description: one slot per Pillar (Mind/Body/Spirit
 *  practices reused from the library or freshly written, and an Expression challenge). Falls back to
 *  the empty scaffold when Vera is off, so the author always gets the balanced shape. */
export async function composeJourneyAction(
  slug: string,
  description: string,
): Promise<ActionResult<{ aiUsed: boolean }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const desc = description.trim().slice(0, 2000)
  if (!desc) return fail('Tell Vera what you want to build first.')

  const admin = db()
  const pillarIds = await pillarIdsBySlug()

  // Candidate library practices per Pillar (real, non-demo, most-adopted first) for Vera to pick.
  const library = {} as Record<ComposePillar, ComposeCandidate[]>
  await Promise.all(
    COMPOSE_PILLARS.map(async (p) => {
      const pid = pillarIds[p]
      if (!pid) { library[p] = []; return }
      const res = await searchLibraryPractices({ pillarId: pid, pageSize: 12, sort: 'top', hideDemo: true })
      library[p] = res.rows.map((r) => ({ id: r.id, title: r.title, summary: r.summary, cadence: r.cadence, durationMin: r.duration_min }))
    }),
  )

  const composition = await draftJourneyComposition({ description: desc, library, profileId: a.profileId })

  // Vera off / failed → still give the author the shape to fill by hand.
  if (!composition) {
    const r = await scaffoldJourneyAction(slug)
    if (isError(r)) return r
    return ok({ aiUsed: false })
  }

  // A phase to hold the composed week.
  const phaseId = await reuseOrCreatePhase(admin, a.planId, SCAFFOLD_PHASE)
  if (!phaseId) return fail('Could not build the journey.')

  // Resolve each Pillar slot: a library pick (carry its real practice_id + domain_id + title) or
  // a freshly-written inline practice. Any slot Vera left empty falls back to the prompt placeholder.
  const filled = new Map<ComposePillar, ComposedRow>()
  for (const slot of composition.practices) {
    if (slot.mode === 'library') {
      const { data: pr } = await admin.from('practices').select('title, domain_id').eq('id', slot.practiceId).maybeSingle()
      const practice = pr as { title: string | null; domain_id: string | null } | null
      filled.set(slot.pillar, {
        block_type: 'practice',
        title: practice?.title ?? 'Practice',
        body: '',
        practice_id: slot.practiceId,
        domain_id: practice?.domain_id ?? pillarIds[slot.pillar] ?? null,
        required: true,
      })
    } else {
      filled.set(slot.pillar, {
        block_type: 'practice',
        title: slot.title,
        body: slot.body,
        domain_id: pillarIds[slot.pillar] ?? null,
        required: true,
      })
    }
  }

  // One row per Pillar, in Pillar order. Any slot Vera left empty falls back to its prompt placeholder.
  const rows: ComposedRow[] = PILLAR_SLOTS.map((s) =>
    filled.get(s.slug) ?? {
      block_type: 'practice',
      title: s.label,
      body: s.prompt,
      domain_id: pillarIds[s.slug] ?? null,
      required: true,
    },
  )
  // Plus one extra-credit Challenge (ADR-300 Part 2): Vera's, or the placeholder she can edit.
  rows.push(
    composition.extraCredit
      ? extraCreditRow(composition.extraCredit.title, composition.extraCredit.body)
      : extraCreditRow(EXTRA_CREDIT_PLACEHOLDER.title, EXTRA_CREDIT_PLACEHOLDER.body),
  )

  await insertChildren(admin, a.planId, phaseId, rows)

  // Name an untitled Journey from Vera's suggestion.
  if (composition.title) {
    const loaded = await getPlan(slug)
    const current = (loaded?.plan.title ?? '').trim().toLowerCase()
    if (!current || current === 'untitled journey' || current === 'untitled') {
      await admin.from('journey_plans').update({ title: composition.title }).eq('id', a.planId)
    }
  }

  done(slug)
  return ok({ aiUsed: true })
}

type ComposedRow = Omit<NewBlock, 'plan_id' | 'parent_id' | 'sort_order'>

/** Resolve a Vera composition into the four Pillar practice rows + an extra-credit slot. */
async function compositionRows(admin: AdminDb, pillarIds: Partial<Record<ComposePillar, string>>, composition: Awaited<ReturnType<typeof draftJourneyComposition>>): Promise<ComposedRow[]> {
  const filled = new Map<ComposePillar, ComposedRow>()
  for (const slot of composition?.practices ?? []) {
    if (slot.mode === 'library') {
      const { data: pr } = await admin.from('practices').select('title, domain_id').eq('id', slot.practiceId).maybeSingle()
      const practice = pr as { title: string | null; domain_id: string | null } | null
      filled.set(slot.pillar, { block_type: 'practice', title: practice?.title ?? 'Practice', body: '', practice_id: slot.practiceId, domain_id: practice?.domain_id ?? pillarIds[slot.pillar] ?? null, required: true })
    } else {
      filled.set(slot.pillar, { block_type: 'practice', title: slot.title, body: slot.body, domain_id: pillarIds[slot.pillar] ?? null, required: true })
    }
  }
  const rows: ComposedRow[] = PILLAR_SLOTS.map((s) =>
    filled.get(s.slug) ?? { block_type: 'practice', title: s.label, body: s.prompt, domain_id: pillarIds[s.slug] ?? null, required: true },
  )
  rows.push(
    composition?.extraCredit
      ? extraCreditRow(composition.extraCredit.title, composition.extraCredit.body)
      : extraCreditRow(EXTRA_CREDIT_PLACEHOLDER.title, EXTRA_CREDIT_PLACEHOLDER.body),
  )
  return rows
}

/** Fill ONE empty week (ADR-302): Vera reads the Journey + this week's focus + the practices already
 *  in earlier weeks, then composes this week's four Pillar practices to fit — building on what exists
 *  rather than repeating it. Degrades to the empty four-Pillar shape when Vera is offline. */
export async function populateWeekAction(slug: string, phaseId: string): Promise<ActionResult<{ aiUsed: boolean }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const admin = db()

  const { data: ph } = await admin
    .from('journey_plan_items')
    .select('id, title, body')
    .eq('id', phaseId)
    .eq('plan_id', a.planId)
    .eq('block_type', 'phase')
    .maybeSingle()
  const phase = ph as { id: string; title: string | null; body: string | null } | null
  if (!phase) return fail('Week not found.')
  const { count } = await admin.from('journey_plan_items').select('id', { count: 'exact', head: true }).eq('parent_id', phaseId)
  if (count) return fail('That week already has content. Clear it first to rebuild.')

  // Build the context for Vera: the Journey + this week's focus + the practices in earlier weeks.
  const loaded = await getPlan(slug)
  const plan = loaded?.plan
  const { data: priorRows } = await admin
    .from('journey_plan_items')
    .select('title')
    .eq('plan_id', a.planId)
    .eq('block_type', 'practice')
  const priorTitles = ((priorRows ?? []) as { title: string | null }[]).map((r) => r.title).filter((t): t is string => !!t).slice(0, 24)
  const description = [
    plan?.title ? `Journey: ${plan.title}.` : '',
    plan?.summary ? `Promise: ${plan.summary}.` : '',
    `This week's focus: ${phase.title ?? ''}${phase.body ? ` — ${phase.body}` : ''}.`,
    priorTitles.length ? `Practices already used in earlier weeks (do not repeat; build on these): ${priorTitles.join('; ')}.` : '',
    'Compose this week\'s four Pillar practices so they fit the focus and follow on from the earlier weeks.',
  ]
    .filter(Boolean)
    .join(' ')

  const pillarIds = await pillarIdsBySlug()
  const library = {} as Record<ComposePillar, ComposeCandidate[]>
  await Promise.all(
    COMPOSE_PILLARS.map(async (p) => {
      const pid = pillarIds[p]
      if (!pid) { library[p] = []; return }
      const res = await searchLibraryPractices({ pillarId: pid, pageSize: 12, sort: 'top', hideDemo: true })
      library[p] = res.rows.map((r) => ({ id: r.id, title: r.title, summary: r.summary, cadence: r.cadence, durationMin: r.duration_min }))
    }),
  )
  const composition = await draftJourneyComposition({ description, library, profileId: a.profileId })

  const rows = await compositionRows(admin, pillarIds, composition)
  await insertChildren(admin, a.planId, phaseId, rows)
  done(slug)
  return ok({ aiUsed: !!composition })
}

type PlanUpdate = Database['public']['Tables']['journey_plans']['Update']

/** Vera "apply the change" (ADR-302): the author types a plain-language change; Vera reads the whole
 *  Journey and returns constrained edit ops, which we re-validate (every id must belong to this plan)
 *  and apply in place. Powers the editor's "tell Vera what to change" box on a populated Journey. */
export async function applyVeraChangeAction(slug: string, request: string): Promise<ActionResult<{ applied: number }>> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const req = request.trim().slice(0, 1000)
  if (!req) return fail('Tell Vera what to change first.')
  const admin = db()

  const loaded = await getPlan(slug)
  if (!loaded) return fail('Journey not found.')
  const plan = loaded.plan
  const items = loaded.items as Array<{ id: string; block_type: string | null; parent_id: string | null; title: string | null; body: string | null; domain_id: string | null; sort_order: number | null }>

  const pillars = await getPillars()
  const pillarSlugById = new Map(pillars.map((p) => [p.id, p.slug]))
  const phases = items
    .filter((b) => b.block_type === 'phase' && b.parent_id === null)
    .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))

  const journey: JourneyForEdit = {
    title: plan.title ?? '',
    subtitle: plan.summary ?? '',
    intro: plan.intro ?? '',
    phases: phases.map((ph) => ({
      id: ph.id,
      title: ph.title ?? '',
      focus: ph.body ?? '',
      practices: items
        .filter((b) => b.parent_id === ph.id && b.block_type !== 'module')
        .map((pr) => ({
          id: pr.id,
          pillar: pr.domain_id ? pillarSlugById.get(pr.domain_id) ?? 'practice' : pr.block_type ?? 'practice',
          title: pr.title ?? '',
          body: pr.body ?? '',
        })),
    })),
  }

  const ops = await planJourneyEdits({ request: req, journey, profileId: a.profileId })
  if (!ops) return fail('Vera is offline right now. Try again in a moment, or edit by hand.')
  if (ops.length === 0) return fail('Vera could not make that change. Try rephrasing it.')

  const validIds = new Set(items.map((b) => b.id))
  const phaseIds = new Set(phases.map((p) => p.id))
  const pillarIds = await pillarIdsBySlug()
  let applied = 0

  for (const op of ops) {
    if (op.op === 'identity') {
      const upd: PlanUpdate = {}
      if (op.title) upd.title = op.title
      if (op.subtitle !== undefined) upd.summary = op.subtitle || null
      if (op.intro !== undefined) upd.intro = op.intro || null
      if (Object.keys(upd).length) { await admin.from('journey_plans').update(upd).eq('id', a.planId); applied++ }
    } else if (op.op === 'phase') {
      if (!phaseIds.has(op.id)) continue
      const upd: BlockUpdate = {}
      if (op.title) upd.title = op.title
      if (op.focus !== undefined) upd.body = op.focus || null
      if (Object.keys(upd).length) { await admin.from('journey_plan_items').update(upd).eq('id', op.id).eq('plan_id', a.planId); applied++ }
    } else if (op.op === 'practice') {
      if (!validIds.has(op.id) || phaseIds.has(op.id)) continue
      const upd: BlockUpdate = {}
      if (op.title) upd.title = op.title
      if (op.body !== undefined) upd.body = op.body || null
      if (Object.keys(upd).length) { await admin.from('journey_plan_items').update(upd).eq('id', op.id).eq('plan_id', a.planId); applied++ }
    } else if (op.op === 'add_practice') {
      if (!phaseIds.has(op.phaseId)) continue
      const sort = await nextSortOrder(admin, a.planId, op.phaseId)
      await admin.from('journey_plan_items').insert({ plan_id: a.planId, parent_id: op.phaseId, block_type: 'practice', title: op.title, body: op.body, domain_id: pillarIds[op.pillar] ?? null, sort_order: sort, required: true })
      applied++
    } else if (op.op === 'remove') {
      if (!validIds.has(op.id)) continue
      await admin.from('journey_plan_items').delete().eq('id', op.id).eq('plan_id', a.planId)
      applied++
    }
  }

  done(slug)
  return ok({ applied })
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
    /** Vera coaching line for a `practice` slot — stored on `settings.coaching_prompt`. The
     *  player shows it when the member reaches the step; '' clears it. */
    coachingPrompt?: string
    /** Bonus Zaps for an extra-credit block — stored on `settings.bonus_zaps` (keeps
     *  `extra_credit: true`). Clamped to a sane range. */
    bonusZaps?: number
  },
): Promise<ActionResult> {
  const a = await authorPlan(slug)
  if (!a) return fail('Only the author can edit this journey.')
  const update: BlockUpdate = {}
  if (patch.title !== undefined) update.title = patch.title.slice(0, 200)
  if (patch.body !== undefined) update.body = patch.body.slice(0, 20000)
  if (patch.required !== undefined) update.required = patch.required
  if (patch.blockType !== undefined && (LEAF_TYPES as readonly string[]).includes(patch.blockType)) update.block_type = patch.blockType
  if (patch.coachingPrompt !== undefined) {
    // A practice slot's `settings` carries only the coaching line, so a whole-object write
    // is safe here (same rationale as the check block above).
    update.settings = { coaching_prompt: patch.coachingPrompt.slice(0, 300) }
  }
  if (patch.bonusZaps !== undefined) {
    // An extra-credit block's `settings` carries only these two keys, so a whole-object write
    // is safe; clamp the Zaps so a bad client can't mint a fortune.
    const zaps = Math.min(500, Math.max(0, Math.floor(patch.bonusZaps)))
    update.settings = { extra_credit: true, bonus_zaps: zaps }
  }
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

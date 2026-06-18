// Shared Journey composition (ADR-302). Vera fills a phase with a balanced set of practices —
// one per Pillar (Mind/Body/Spirit/Expression), library-first — from a plain description. This is
// the one place that logic lives, so the editor actions (compose / populate a week) and the guided
// builder (populate EVERY week from the uploaded outline at creation) share it. Plain helpers, not
// server actions, so a 'use server' module can import them (those files may only export actions).

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { getPillars } from '@/lib/pillars'
import { searchLibraryPractices } from '@/lib/practices'
import {
  draftJourneyComposition,
  COMPOSE_PILLARS,
  type ComposePillar,
  type ComposeCandidate,
} from '@/lib/ai/journey-composition'
import { DEFAULT_EXTRA_CREDIT_ZAPS } from '@/lib/journeys/grants'

type AdminDb = ReturnType<typeof createAdminClient>
type NewBlock = Database['public']['Tables']['journey_plan_items']['Insert']
export type ComposedRow = Omit<NewBlock, 'plan_id' | 'parent_id' | 'sort_order'>

/** The four Pillar slots, each with the placeholder prompt used when Vera is off / leaves it empty. */
export const PILLAR_SLOTS: { slug: ComposePillar; label: string; prompt: string }[] = [
  { slug: 'mind', label: 'Mind practice', prompt: 'A Mind practice to steady attention. Pick one from the library or let Vera draft it.' },
  { slug: 'body', label: 'Body practice', prompt: 'A Body practice that is physical and doable. Pick one from the library or let Vera draft it.' },
  { slug: 'spirit', label: 'Spirit practice', prompt: 'A Spirit practice that is reflective or connecting. Pick one from the library or let Vera draft it.' },
  { slug: 'expression', label: 'Expression practice', prompt: 'An Expression practice: make something, share something, or connect with someone. Pick one from the library or let Vera draft it.' },
]

export const EXTRA_CREDIT_PLACEHOLDER = {
  title: 'Extra credit',
  body: 'An above-and-beyond bonus challenge. It is optional, and finishing it pays bonus Zaps.',
}

/** An extra-credit block (ADR-300 Part 2): an `exercise` block that is NOT required (does not gate
 *  completion) and carries `settings.extra_credit` + `settings.bonus_zaps`. The player pays the
 *  bonus Zaps once on completion (lib/journeys/grants.ts). Not one of the four Pillar practices. */
export function extraCreditRow(title: string, body: string, zaps = DEFAULT_EXTRA_CREDIT_ZAPS): ComposedRow {
  return {
    block_type: 'exercise',
    title: title.slice(0, 200),
    body: body.slice(0, 2000),
    required: false,
    settings: { extra_credit: true, bonus_zaps: zaps },
  }
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

/** Candidate library practices per Pillar (real, non-demo, most-adopted first) for Vera to pick. */
async function candidatesByPillar(
  pillarIds: Partial<Record<ComposePillar, string>>,
): Promise<Record<ComposePillar, ComposeCandidate[]>> {
  const library = {} as Record<ComposePillar, ComposeCandidate[]>
  await Promise.all(
    COMPOSE_PILLARS.map(async (p) => {
      const pid = pillarIds[p]
      if (!pid) { library[p] = []; return }
      const res = await searchLibraryPractices({ pillarId: pid, pageSize: 12, sort: 'top', hideDemo: true })
      library[p] = res.rows.map((r) => ({ id: r.id, title: r.title, summary: r.summary, cadence: r.cadence, durationMin: r.duration_min }))
    }),
  )
  return library
}

/** Insert a sequence of child blocks under `parentId`, in order. */
export async function insertChildren(admin: AdminDb, planId: string, parentId: string, rows: ComposedRow[]): Promise<void> {
  let sort = 0
  for (const row of rows) {
    await admin.from('journey_plan_items').insert({ ...row, plan_id: planId, parent_id: parentId, sort_order: sort++ })
  }
}

/** Resolve a Vera composition into the four Pillar practice rows + an extra-credit slot. A library
 *  pick carries its real practice_id + domain_id + title; an empty slot falls back to its prompt. */
async function compositionRows(
  admin: AdminDb,
  pillarIds: Partial<Record<ComposePillar, string>>,
  composition: Awaited<ReturnType<typeof draftJourneyComposition>>,
): Promise<ComposedRow[]> {
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

// ── Master Framework week skeleton (deterministic, no AI) ───────────────────────────────────
//
// The one definition of the recommended week shape, so the static template (templates.ts) and any
// future Vera fill stamp the SAME structure. A master week is: a lesson (the week's focus), three
// weekly Pillar practices (Mind / Body / Spirit), one weekly Expression Challenge (a LIGHT
// extra-credit exercise), and a reflection. The ANCHOR practice (the one steady daily practice)
// lives only in the Onboarding phase, so it isn't repeated every week. Plain placeholder copy the
// author or Vera fills in; voice canon applies (no em dashes).

/** Light bonus Zaps for a weekly Expression Challenge — kept small so the heavy capstone (the Close
 *  phase) reads as the real finish. The capstone uses the standard extra-credit default. */
export const MASTER_WEEKLY_BONUS_ZAPS = 10

/** The three weekly Pillar practices in a master week (the anchor lives in Onboarding, Expression
 *  is the weekly Challenge, so these are the rotating slots). */
const MASTER_WEEK_PILLARS = ['mind', 'body', 'spirit'] as const

/** A practice slot row tagged with its Pillar. `body` is the placeholder prompt the author/Vera
 *  fills; an empty `practice_id` means the slot is unadopted (the editor shows it as fillable). */
function pillarPracticeRow(
  slug: ComposePillar,
  pillarIds: Partial<Record<ComposePillar, string>>,
  opts: { anchor?: boolean } = {},
): ComposedRow {
  const slot = PILLAR_SLOTS.find((s) => s.slug === slug)
  return {
    block_type: 'practice',
    title: opts.anchor ? 'Anchor practice' : slot?.label ?? 'Practice',
    body: opts.anchor
      ? 'Your one steady daily practice. Do this every day for the whole Journey. Pick one from the library or write your own.'
      : slot?.prompt ?? '',
    domain_id: pillarIds[slug] ?? null,
    required: true,
    settings: opts.anchor ? { anchor: true } : {},
  }
}

/** The recommended shape for ONE week-Phase (deterministic). Order: the week's focus lesson, the
 *  three weekly Pillar practices (Mind / Body / Spirit), one LIGHT weekly Expression Challenge, and
 *  a reflection. No anchor here — that lives once in the Onboarding phase. */
export function masterWeekRows(pillarIds: Partial<Record<ComposePillar, string>>): ComposedRow[] {
  return [
    {
      block_type: 'lesson',
      title: "This week's focus",
      body: 'Open with a hook, ask one honest question, then teach the week\'s idea in plain words.',
      required: true,
    },
    ...MASTER_WEEK_PILLARS.map((slug) => pillarPracticeRow(slug, pillarIds)),
    {
      ...extraCreditRow(
        'Expression Challenge',
        'Make something, share something, or connect with someone this week. Optional, and finishing it pays a few bonus Zaps.',
        MASTER_WEEKLY_BONUS_ZAPS,
      ),
      domain_id: pillarIds.expression ?? null,
    },
    {
      block_type: 'reflection',
      title: 'Reflect',
      body: 'What shifted this week? Note one thing you want to carry forward.',
      required: true,
    },
  ]
}

/** The Onboarding phase that wraps the Journey before week 1: a welcome lesson, the ANCHOR practice
 *  (the one daily practice flagged `settings.anchor`), and an intro prompt to set intentions. */
export function masterOnboardingRows(pillarIds: Partial<Record<ComposePillar, string>>): ComposedRow[] {
  return [
    {
      block_type: 'lesson',
      title: 'Welcome',
      body: 'Set the scene: what this Journey is, who it is for, and how each week runs.',
      required: true,
    },
    pillarPracticeRow('mind', pillarIds, { anchor: true }),
    {
      block_type: 'reflection',
      title: 'Set your intention',
      body: 'In a line or two, name why you are here and what you want by the end.',
      required: true,
    },
  ]
}

/** The Close phase that caps the Journey: the heavy capstone Expression Challenge (NOT light — this
 *  is the real finish, so it pays the standard bonus) and a final reflection. */
export function masterCloseRows(pillarIds: Partial<Record<ComposePillar, string>>): ComposedRow[] {
  return [
    {
      ...extraCreditRow(
        'Capstone Expression Challenge',
        'The big finish: create and share the thing this whole Journey was building toward. This is the one that counts.',
      ),
      domain_id: pillarIds.expression ?? null,
    },
    {
      block_type: 'reflection',
      title: 'Look back',
      body: 'You made it. What changed, and what is the one practice you are keeping?',
      required: true,
    },
  ]
}

/** Compose one phase's contents from a plain description: one practice per Pillar (library-first)
 *  plus an extra-credit slot, inserted under `phaseId`. Best-effort — when Vera is off the phase
 *  still gets the four placeholder slots to fill by hand. Returns whether AI was used + any title
 *  Vera suggested (used to name an untitled Journey). */
export async function composeIntoPhase(input: {
  admin: AdminDb
  planId: string
  phaseId: string
  description: string
  profileId?: string | null
}): Promise<{ aiUsed: boolean; title: string | null }> {
  const pillarIds = await pillarIdsBySlug()
  const library = await candidatesByPillar(pillarIds)
  const composition = await draftJourneyComposition({
    description: input.description.trim().slice(0, 4000),
    library,
    profileId: input.profileId,
  })
  const rows = await compositionRows(input.admin, pillarIds, composition)
  await insertChildren(input.admin, input.planId, input.phaseId, rows)
  return { aiUsed: !!composition, title: composition?.title ?? null }
}

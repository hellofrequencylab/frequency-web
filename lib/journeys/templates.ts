// Journeys v2 — authoring templates (ADR-252, J4, JOURNEYS.md §6). Starting from a proven
// structure (not a blank page) is the single highest-leverage authoring feature (research §10).
// A template is a pure Program → Phase → Module → Lesson skeleton; `templateToBlocks` flattens
// it into ordered block rows (parents before children, temp ids the create action resolves to
// real ones). Pure + unit-tested.

import type { LeafType } from './tree'
import {
  masterWeekRows,
  masterOnboardingRows,
  masterCloseRows,
  type ComposedRow,
} from './compose'
import type { ComposePillar } from '@/lib/ai/journey-composition'

export interface TemplateLesson {
  type: LeafType
  title: string
}
export interface TemplateModule {
  title: string
  lessons: TemplateLesson[]
}
export interface TemplatePhase {
  title: string
  modules: TemplateModule[]
}
export interface JourneyTemplate {
  id: string
  name: string
  description: string
  /** Suggested emoji + accent for the new journey. */
  emoji: string
  phases: TemplatePhase[]
}

const phase = (title: string, lessons: TemplateLesson[]): TemplatePhase => ({
  title,
  modules: [{ title: '', lessons }],
})
const L = (type: LeafType, title: string): TemplateLesson => ({ type, title })

export const JOURNEY_TEMPLATES: JourneyTemplate[] = [
  {
    id: 'four-week-reset',
    name: '4-Week Reset',
    description: 'A focused four-phase reset — one phase a week. Great for a habit or mindset shift.',
    emoji: '🌱',
    phases: [
      phase('Week 1 · Set the foundation', [L('video', 'Welcome + what to expect'), L('reading', 'The core idea'), L('exercise', 'Your starting point')]),
      phase('Week 2 · Build the habit', [L('video', 'The daily practice'), L('exercise', 'Try it this week'), L('check', 'Quick check-in')]),
      phase('Week 3 · Go deeper', [L('video', 'Going further'), L('reflection', 'What is shifting?'), L('practice', 'Take it into the world')]),
      phase('Week 4 · Make it stick', [L('video', 'Keeping it going'), L('reflection', 'Your plan from here'), L('reading', 'Resources to continue')]),
    ],
  },
  {
    id: 'coaching-arc',
    name: '5-Phase Coaching Arc',
    description: 'A classic coaching journey: orient, learn, apply, integrate, and commit.',
    emoji: '🧭',
    phases: [
      phase('Orient', [L('video', 'Kickoff'), L('reflection', 'Where are you now?')]),
      phase('Learn', [L('video', 'The framework'), L('reading', 'Deep dive'), L('check', 'Knowledge check')]),
      phase('Apply', [L('exercise', 'This week’s practice'), L('practice', 'Real-world action')]),
      phase('Integrate', [L('video', 'Bringing it together'), L('reflection', 'What changed?')]),
      phase('Commit', [L('reflection', 'Your commitment'), L('reading', 'Keep growing')]),
    ],
  },
  {
    id: 'onboarding',
    name: 'Onboarding Program',
    description: 'Welcome new members and get them to their first win.',
    emoji: '👋',
    phases: [
      phase('Start here', [L('video', 'Welcome'), L('reading', 'How this works')]),
      phase('Get set up', [L('exercise', 'Set your goal'), L('check', 'You’re ready?')]),
      phase('First win', [L('video', 'Do the first thing'), L('practice', 'Your first action'), L('reflection', 'How did it go?')]),
    ],
  },
  {
    id: 'thirty-day-challenge',
    name: '30-Day Challenge',
    description: 'A high-energy month: one daily practice, weekly check-ins, and a finish-line reflection.',
    emoji: '🔥',
    phases: [
      phase('Week 1 · Show up', [L('video', 'The challenge, and the one daily practice'), L('practice', 'Day 1 to 7'), L('check', 'End of week one')]),
      phase('Week 2 · Build momentum', [L('practice', 'Day 8 to 14'), L('reflection', 'What is getting easier?')]),
      phase('Week 3 · Push through', [L('practice', 'Day 15 to 21'), L('reading', 'Getting past the dip'), L('check', 'End of week three')]),
      phase('Week 4 · Finish strong', [L('practice', 'Day 22 to 30'), L('reflection', 'What you built'), L('exercise', 'Keep one habit')]),
    ],
  },
  {
    id: 'weekend-intensive',
    name: 'Weekend Intensive',
    description: 'A two-day deep dive: teach it Saturday, apply it Sunday, and leave with a plan.',
    emoji: '⚡',
    phases: [
      phase('Before you start', [L('video', 'Welcome + what to bring'), L('reading', 'Read this first')]),
      phase('Day 1 · Learn it', [L('video', 'The core teaching'), L('exercise', 'Work it through'), L('reflection', 'What landed?')]),
      phase('Day 2 · Live it', [L('practice', 'Put it into practice'), L('exercise', 'Your real-world plan'), L('reflection', 'Your next step')]),
    ],
  },
]

export function getTemplate(id: string): JourneyTemplate | undefined {
  return JOURNEY_TEMPLATES.find((t) => t.id === id)
}

export interface TemplateBlockRow {
  tempId: string
  parentTempId: string | null
  blockType: 'phase' | 'module' | LeafType
  title: string
  sortOrder: number
}

// ── The Master Framework (the recommended shape, deterministic, no AI) ───────────────────────
//
// The single "stamp it to the recommended shape" template. Unlike the simple skeleton templates
// above (Phase → Module → Lesson with just a type + title), every block here carries its real
// content: the anchor flag, a Pillar `domain_id`, and the Expression Challenge's extra-credit
// settings. So its rows are full ComposedRow blocks (the same shape compose.ts stamps), built once
// in compose.ts and reused here — the one definition the template AND any future Vera fill share.
//
// Shape: an Onboarding phase (welcome + the ANCHOR practice + an intro prompt) → N week-Phases (the
// week's focus lesson + Mind/Body/Spirit practices + a LIGHT weekly Expression Challenge + a
// reflection) → a Close phase (the HEAVY capstone Expression Challenge + a final reflection).

export const MASTER_FRAMEWORK_ID = 'master-framework'

/** Options for stamping the Master Framework. `fixed` toggles the weekly-practice rotation:
 *  default (false) leaves DISTINCT placeholder slots per week for Vera/the author to fill with
 *  different practices each week; `fixed: true` stamps the SAME Mind/Body/Spirit slots into every
 *  week (held fixed for the whole Journey). This is a scaffold-time choice, never persisted. */
export interface MasterFrameworkOptions {
  weeks?: number
  fixed?: boolean
}

/** Static identity for the Master Framework, used to name + accent a new Journey. */
export const MASTER_FRAMEWORK = {
  id: MASTER_FRAMEWORK_ID,
  name: 'Master Framework',
  description: 'The recommended shape, ready to fill: a welcome, weekly practices across the Pillars, an Expression Challenge each week, and a capstone to finish.',
  emoji: '🧭',
} as const

/** A phase + its ordered child blocks, the unit the Master Framework flattener walks. */
interface MasterPhase {
  title: string
  body?: string | null
  blocks: ComposedRow[]
}

/** A full Master-Framework block row: a phase OR one of its child blocks (a ComposedRow), with the
 *  same tempId / parentTempId / sortOrder shape the create action inserts in order. */
export interface MasterBlockRow {
  tempId: string
  parentTempId: string | null
  /** A phase row, or a leaf/practice ComposedRow to insert under its phase. */
  block: { kind: 'phase'; title: string; body: string | null } | { kind: 'block'; row: ComposedRow }
  sortOrder: number
}

/** Build the Master Framework's phase list (Onboarding → N weeks → Close) for the given Pillar ids.
 *  When `fixed` is true the same weekly practice slots repeat each week; otherwise each week gets a
 *  distinct set of placeholder slots (identical shape, filled differently later). The shape is the
 *  same either way — "fixed" only changes how the author/Vera treats the slots downstream. */
export function masterFrameworkPhases(
  pillarIds: Partial<Record<ComposePillar, string>>,
  opts: MasterFrameworkOptions = {},
): MasterPhase[] {
  const weeks = Math.min(12, Math.max(1, Math.floor(opts.weeks ?? 4)))
  const phases: MasterPhase[] = [
    { title: 'Welcome', body: 'Start here. Meet the Journey and set your anchor.', blocks: masterOnboardingRows(pillarIds) },
  ]
  // The shared weekly skeleton. Default: rebuild it per week so each week is a fresh, distinct set
  // of slots. Held fixed: build it once and stamp the SAME slots into every week.
  const heldFixed = opts.fixed ? masterWeekRows(pillarIds) : null
  for (let i = 0; i < weeks; i++) {
    phases.push({
      title: `Week ${i + 1}`,
      body: null,
      // Held fixed: clone the shared rows so each week's blocks are independent objects (defensive —
      // they're inserted, not mutated, but a shared reference per week would be a footgun later).
      blocks: heldFixed ? heldFixed.map((r) => ({ ...r })) : masterWeekRows(pillarIds),
    })
  }
  phases.push({ title: 'Close', body: 'The finish line. Ship the capstone and look back.', blocks: masterCloseRows(pillarIds) })
  return phases
}

/** Flatten the Master Framework into ordered block rows (parents before children), ready for the
 *  create action to insert in order and resolve each tempId to a real inserted id. */
export function masterFrameworkToBlocks(
  pillarIds: Partial<Record<ComposePillar, string>>,
  opts: MasterFrameworkOptions = {},
): MasterBlockRow[] {
  const rows: MasterBlockRow[] = []
  masterFrameworkPhases(pillarIds, opts).forEach((p, pi) => {
    const phaseTempId = `phase-${pi}`
    rows.push({ tempId: phaseTempId, parentTempId: null, block: { kind: 'phase', title: p.title, body: p.body ?? null }, sortOrder: pi })
    p.blocks.forEach((row, bi) => {
      rows.push({ tempId: `block-${pi}-${bi}`, parentTempId: phaseTempId, block: { kind: 'block', row }, sortOrder: bi })
    })
  })
  return rows
}

/** Flatten a template into ordered block rows (parents before children). The create action
 *  inserts them in order, mapping each tempId to the real inserted id for child parent refs. */
export function templateToBlocks(t: JourneyTemplate): TemplateBlockRow[] {
  const rows: TemplateBlockRow[] = []
  t.phases.forEach((p, pi) => {
    const phaseId = `phase-${pi}`
    rows.push({ tempId: phaseId, parentTempId: null, blockType: 'phase', title: p.title, sortOrder: pi })
    p.modules.forEach((m, mi) => {
      // Skip an empty single module wrapper — attach its lessons straight to the phase.
      const hasModuleTitle = m.title.trim().length > 0
      const parentForLessons = hasModuleTitle ? `module-${pi}-${mi}` : phaseId
      if (hasModuleTitle) {
        rows.push({ tempId: parentForLessons, parentTempId: phaseId, blockType: 'module', title: m.title, sortOrder: mi })
      }
      m.lessons.forEach((l, li) => {
        rows.push({ tempId: `lesson-${pi}-${mi}-${li}`, parentTempId: parentForLessons, blockType: l.type, title: l.title, sortOrder: li })
      })
    })
  })
  return rows
}

// Journeys v2 — authoring templates (ADR-252, J4, JOURNEYS.md §6). Starting from a proven
// structure (not a blank page) is the single highest-leverage authoring feature (research §10).
// A template is a pure Program → Phase → Module → Lesson skeleton; `templateToBlocks` flattens
// it into ordered block rows (parents before children, temp ids the create action resolves to
// real ones). Pure + unit-tested.

import type { LeafType } from './tree'

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

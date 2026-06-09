// Local fallback for the Journey-page widget catalog used by the builder's
// "Page layout" section, until lib/journey-page-config.ts (owned by another agent)
// lands. Mirrors the widgets listed in docs/JOURNEYS.md §10.
//
// TODO: swap this for lib/journey-page-config.ts — import its WidgetId list +
// DEFAULT layout once that module exists, and delete this file.

import type { PageWidgetConfig } from '@/lib/journey-plans'

export interface WidgetMeta {
  id: string
  label: string
  /** A one-line description of what the block shows, for the editor. */
  hint: string
}

/** The available Journey-page widgets, in the recommended default order. */
export const JOURNEY_WIDGETS: WidgetMeta[] = [
  { id: 'progress', label: 'Progress tracker', hint: 'Week N of 13 · weeks banked toward completion.' },
  { id: 'next-step', label: 'Next step card', hint: 'The dominant log target — the current practice.' },
  { id: 'checklist', label: 'Step checklist', hint: 'Every step with its on-track state.' },
  { id: 'pillar-balance', label: 'Pillar balance', hint: 'How the path spreads across the four Pillars.' },
  { id: 'streak', label: 'Streak & shields', hint: 'The daily streak and earned freeze shields.' },
  { id: 'gamification', label: 'Gamification panel', hint: 'Zaps · rank · streak · Gems at a glance.' },
  { id: 'reward-preview', label: 'Reward preview', hint: 'What completing the Journey pays out.' },
  { id: 'circle-companions', label: 'Circle companions', hint: 'Members of your circles on this Journey.' },
  { id: 'resonance', label: 'Resonance', hint: 'The circle co-op completion meter.' },
  { id: 'leaderboard', label: 'Leaderboard', hint: 'Circle / nexus / global standings.' },
  { id: 'season-context', label: 'Season context', hint: 'The season, its theme, and the Act arc.' },
  { id: 'practice-guide', label: 'Practice guide', hint: 'The author’s how-to / story (markdown).' },
  { id: 'related-journeys', label: 'Related journeys', hint: 'Other Journeys to explore next.' },
  { id: 'community-activity', label: 'Community activity', hint: 'Recent logs + milestones from others.' },
]

const DEFAULT_ENABLED = new Set([
  'progress', 'next-step', 'checklist', 'pillar-balance', 'streak',
  'gamification', 'reward-preview', 'circle-companions', 'practice-guide',
])

/** The default layout applied when a plan's page_config is null. */
export const DEFAULT_PAGE_CONFIG: PageWidgetConfig[] = JOURNEY_WIDGETS.map((w) => ({
  id: w.id,
  enabled: DEFAULT_ENABLED.has(w.id),
}))

/** Normalize a stored config against the current catalog: keep known widgets in
 *  their saved order, drop unknown ids, and append any newly-added widgets
 *  (disabled) at the end. Always returns the full catalog so the editor is stable. */
export function normalizePageConfig(stored: PageWidgetConfig[] | null): PageWidgetConfig[] {
  if (!stored || stored.length === 0) return DEFAULT_PAGE_CONFIG.map((w) => ({ ...w }))
  const known = new Map(JOURNEY_WIDGETS.map((w) => [w.id, w]))
  const seen = new Set<string>()
  const ordered: PageWidgetConfig[] = []
  for (const w of stored) {
    if (!known.has(w.id) || seen.has(w.id)) continue
    seen.add(w.id)
    ordered.push({ id: w.id, enabled: w.enabled, ...(w.settings ? { settings: w.settings } : {}) })
  }
  for (const w of JOURNEY_WIDGETS) {
    if (!seen.has(w.id)) ordered.push({ id: w.id, enabled: false })
  }
  return ordered
}

export const WIDGET_BY_ID = new Map(JOURNEY_WIDGETS.map((w) => [w.id, w]))

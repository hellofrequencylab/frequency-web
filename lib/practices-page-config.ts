// The Practices-page block system (per-user). The Practices page composes a small set
// of toggleable, reorderable content blocks — mirroring the Journey page-config pattern
// (lib/journey-page-config.ts), but SINGLE-MODE and stored PER-USER (profiles.meta.
// practicesLayout, no migration) rather than per-entity. This module is the single
// source of truth for:
//   • the canonical block id union (PRACTICES_WIDGET_IDS / PracticesWidgetId),
//   • the DEFAULT layout (all blocks, in order),
//   • normalizePracticesLayout() — merge a stored array over the default, drop unknown
//     ids, append any newly-added default ids the stored array predates.
//
// Pure + dependency-light (only the PageWidgetConfig shape from journey-plans), so it's
// safe to import from a Server Component, the editor, and a unit test alike.

import type { PageWidgetConfig } from '@/lib/journey-plans'

/** The canonical, closed set of Practices-page block ids — must match the widget
 *  registry the page renders exactly. Adding a block = add its id here + a default
 *  entry (it's all enabled by default) + a renderer on the page. An unknown stored id
 *  is dropped on normalize. */
export const PRACTICES_WIDGET_IDS = [
  'practices-stats', // the headline stats strip (streak · airtime · logs)
  'practices-activity', // recent activity / log history
  'practices-balance', // Pillar balance meter across the four Pillars
  'practices-mine', // "Your practices" — the member's adopted list
] as const

export type PracticesWidgetId = (typeof PRACTICES_WIDGET_IDS)[number]

const PRACTICES_WIDGET_ID_SET: ReadonlySet<string> = new Set(PRACTICES_WIDGET_IDS)

/** True iff `x` is one of our canonical Practices block ids. */
export function isPracticesWidgetId(x: string): x is PracticesWidgetId {
  return PRACTICES_WIDGET_ID_SET.has(x)
}

/** The hardcoded default layout, applied when nothing is stored. Order matters; every
 *  block is enabled by default. */
export const DEFAULT_PRACTICES_LAYOUT: PageWidgetConfig[] = PRACTICES_WIDGET_IDS.map((id) => ({
  id,
  enabled: true,
}))

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Merge a stored layout over the default into one ordered, render-ready list. The
 * contract (mirrors journey-page-config's normalizePageConfig, minus the mode arg):
 *   1. Stored order + enabled flags win for known ids the member touched.
 *   2. Unknown ids (typos, retired blocks) are dropped — the union is closed.
 *   3. Any default id missing from the stored array is appended in default order, so a
 *      newly-added block still appears for a member whose stored layout predates it.
 *   4. `enabled` is coerced to a boolean (defaulting to enabled when the flag is absent).
 *
 * Pure — no I/O, no mutation of the input. Accepts `unknown` so it can take a raw value
 * straight off profiles.meta without a prior cast.
 */
export function normalizePracticesLayout(stored: unknown): PageWidgetConfig[] {
  const arr = Array.isArray(stored) ? stored : []
  const result: PageWidgetConfig[] = []
  const seen = new Set<PracticesWidgetId>()

  // 1 + 2. Honour the stored order/flags for known ids; drop the rest.
  for (const entry of arr) {
    if (!isPlainObject(entry) || typeof entry.id !== 'string') continue
    if (!isPracticesWidgetId(entry.id)) continue
    const id = entry.id
    if (seen.has(id)) continue
    const next: PageWidgetConfig = { id, enabled: entry.enabled !== false }
    if (isPlainObject(entry.settings)) next.settings = entry.settings
    result.push(next)
    seen.add(id)
  }

  // 3. Append any default ids the stored array didn't mention, in default order.
  for (const id of PRACTICES_WIDGET_IDS) {
    if (seen.has(id)) continue
    result.push({ id, enabled: true })
    seen.add(id)
  }

  return result
}

/** Just the enabled blocks, in order — the common case for the renderer. */
export function enabledPracticesWidgets(stored: unknown): PageWidgetConfig[] {
  return normalizePracticesLayout(stored).filter((w) => w.enabled)
}

/** Read a member's stored layout off a loaded profile `meta` value, normalized + render-ready.
 *  (Lives here, not in the 'use server' action file, so a Server Component can call it directly.) */
export function readPracticesLayout(meta: unknown): PageWidgetConfig[] {
  return normalizePracticesLayout((meta as { practicesLayout?: unknown } | null)?.practicesLayout)
}

/** Editor-facing label + one-line hint per block. The editor renders from the SAME ids
 *  the page renders, so the two can never drift. */
export const WIDGET_META: Record<PracticesWidgetId, { label: string; hint: string }> = {
  'practices-stats': { label: 'Stats', hint: 'Your streak, airtime, and logs at a glance.' },
  'practices-activity': { label: 'Activity', hint: 'Your recent practice history.' },
  'practices-balance': { label: 'Pillar balance', hint: 'How your practice spreads across the four Pillars.' },
  'practices-mine': { label: 'Your practices', hint: 'The practices you have adopted.' },
}

/** The normalized layout joined to the editor labels — what the layout editor renders
 *  and edits. Stored order/flags first, then any newly-added defaults appended. */
export function editorPracticesConfig(
  stored: unknown,
): { id: PracticesWidgetId; label: string; enabled: boolean }[] {
  return normalizePracticesLayout(stored).map((c) => ({
    id: c.id as PracticesWidgetId,
    label: WIDGET_META[c.id as PracticesWidgetId].label,
    enabled: c.enabled,
  }))
}

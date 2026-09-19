// Authored Journey outcomes (LIVE-393, ADR-1463).
//
// "What you'll learn" used to restate `journey_plans.summary`. There is still no outcomes
// column: the ordered list rides on the story widget's `settings.outcomes` so Advanced layout
// saves keep it (editorPageConfig preserves settings) and visitor faces can read it without
// a schema change. The block stays a sandwich, not a fourth page_config toggle (ADR-1462).
//
// PURE + dependency-light (only the PageWidgetConfig shape). Safe from Server Components,
// the rail, and vitest.

import type { PageWidgetConfig } from '@/lib/journey-plans'

export const JOURNEY_OUTCOMES_CAP = 12
export const JOURNEY_OUTCOME_MAX_LEN = 200

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Trim, drop empties, cap length and count. Accepts strings or `{ text }` rows. */
export function normalizeJourneyOutcomes(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (const item of list) {
    const text =
      typeof item === 'string'
        ? item
        : isPlain(item) && typeof item.text === 'string'
          ? item.text
          : ''
    const next = text.trim().slice(0, JOURNEY_OUTCOME_MAX_LEN)
    if (next) out.push(next)
    if (out.length >= JOURNEY_OUTCOMES_CAP) break
  }
  return out
}

/** Read the authored list off a stored page_config. Empty when none were written. */
export function readJourneyOutcomes(stored: PageWidgetConfig[] | null | undefined): string[] {
  for (const entry of stored ?? []) {
    if (!entry || entry.id !== 'story' || !isPlain(entry.settings)) continue
    return normalizeJourneyOutcomes(entry.settings.outcomes)
  }
  return []
}

/** Write the authored list onto the story entry, preserving every other widget and the
 *  reserved wizard row. Returns a NEW array. Empty list deletes the settings key. */
export function writeJourneyOutcomes(
  stored: PageWidgetConfig[] | null | undefined,
  outcomes: readonly string[],
): PageWidgetConfig[] {
  const items = normalizeJourneyOutcomes(outcomes)
  const list = [...(stored ?? [])]
  const i = list.findIndex((e) => e && e.id === 'story')
  if (i < 0) {
    if (items.length === 0) return list
    return [...list, { id: 'story', enabled: true, settings: { outcomes: items } }]
  }
  const prev = list[i]
  const settings = { ...(isPlain(prev.settings) ? prev.settings : {}) }
  if (items.length > 0) settings.outcomes = items
  else delete settings.outcomes
  if (Object.keys(settings).length === 0) {
    const { settings: _dropped, ...rest } = prev
    list[i] = rest
  } else {
    list[i] = { ...prev, settings }
  }
  return list
}

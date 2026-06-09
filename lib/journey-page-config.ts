// The Journey-page widget system (docs/JOURNEYS.md §10). The Journey page composes
// toggleable, reorderable content blocks — the same pattern as the right-rail widget
// framework (PAGE-FRAMEWORK §4). The author configures which blocks show, in what
// order, and per-widget settings; that lives on `journey_plans.page_config` (an ordered
// array of `PageWidgetConfig`). This module is the single source of truth for:
//   • the canonical widget id union (WIDGET_IDS / WidgetId),
//   • the sensible DEFAULT layout per mode (active vs discovery),
//   • `normalizePageConfig()` — merge stored config over the default, drop unknown ids,
//     and force-enable the widgets a mode CANNOT live without.
//
// Pure + dependency-light (only the PageWidgetConfig shape from journey-plans), so it's
// safe to import from a Server Component, the editor, and a vitest unit test alike.

import type { PageWidgetConfig } from '@/lib/journey-plans'

/** Which face of the Journey page a layout is for. */
export type JourneyPageMode = 'active' | 'discovery'

/** The canonical, closed set of Journey-page widget ids. Adding a widget = add its id
 *  here + a default entry below + a renderer in components/journey. Editors and the page
 *  both read from this list, so an unknown stored id is dropped on normalize. */
export const WIDGET_IDS = [
  // Active-mode (adopted member) blocks
  'next-step', // the dominant Next-Step card (REQUIRED in active mode)
  'gamification', // Zaps · rank · streak · Gems strip (REQUIRED in active mode)
  'progress', // season-completion arc — Week N of 13 · qualifying weeks
  'checklist', // the full step checklist with on-track/behind states
  'streak', // streak + earned shields strip
  'companions', // the Chorus / circle-companions (Resonance teaser) strip
  'practice-guide', // the practice guide (markdown intro), read while practising
  // Discovery-mode (visitor / not-adopted) blocks
  'story', // the Story — intro markdown ("why this journey")
  'path', // The Path — ordered steps with cadence + note + tier
  'pillar-balance', // the Pillar coverage meter
  'social-proof', // "47 on this journey" adopt-count proof
  'reward-preview', // completion reward preview (Gems + badge)
  'completion-rule', // the completion rule (target_weeks of 13)
] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

const WIDGET_ID_SET: ReadonlySet<string> = new Set(WIDGET_IDS)

/** True iff `id` is one of our canonical widget ids. */
export function isWidgetId(id: string): id is WidgetId {
  return WIDGET_ID_SET.has(id)
}

/** Widgets a mode cannot turn off — the page would be meaningless without them. The
 *  Next-Step card and the gamification strip are the spine of active mode (§10), so even
 *  a stored config that disabled them is overridden back on. */
export const REQUIRED_WIDGETS: Record<JourneyPageMode, readonly WidgetId[]> = {
  active: ['next-step', 'gamification'],
  discovery: ['path'],
}

/** The hardcoded default layout, applied when `page_config` is null (§10). Order matters:
 *  active mode leads with the Next-Step card, then progress, checklist, the rest; discovery
 *  leads with the story and the path. Every id present here is enabled by default. */
export const DEFAULT_LAYOUT: Record<JourneyPageMode, readonly WidgetId[]> = {
  active: ['next-step', 'progress', 'checklist', 'gamification', 'streak', 'companions', 'practice-guide'],
  discovery: ['story', 'path', 'pillar-balance', 'social-proof', 'reward-preview', 'completion-rule'],
}

/** A normalized, render-ready widget descriptor: a known id + its resolved enabled flag +
 *  any author settings. The page maps over these in order and renders the matching block. */
export interface ResolvedWidget {
  id: WidgetId
  enabled: boolean
  settings: Record<string, unknown>
}

/**
 * Merge a stored `page_config` over the mode's default layout into one ordered, render-ready
 * list. The contract:
 *   1. Only widgets valid for THIS mode appear — a stored 'story' id is irrelevant in active
 *      mode and is dropped (and vice-versa). This lets one stored array describe both faces.
 *   2. Stored order + enabled flags win for ids the author touched; untouched default widgets
 *      keep their default slot, appended after the stored ones in their default order.
 *   3. Unknown ids (typos, retired widgets) are dropped — the union is closed.
 *   4. REQUIRED widgets for the mode are always present AND always enabled, regardless of what
 *      the stored config said. They're injected at the front in their default order if missing.
 *
 * Pure — no I/O, no mutation of the input.
 */
export function normalizePageConfig(
  stored: PageWidgetConfig[] | null | undefined,
  mode: JourneyPageMode,
): ResolvedWidget[] {
  const allowed = new Set<WidgetId>(DEFAULT_LAYOUT[mode])
  // Required widgets are part of the mode even if an author dropped them from the default list.
  for (const id of REQUIRED_WIDGETS[mode]) allowed.add(id)
  const required = new Set<WidgetId>(REQUIRED_WIDGETS[mode])

  const result: ResolvedWidget[] = []
  const seen = new Set<WidgetId>()

  // 1. Honour the stored order/flags for ids valid in this mode.
  for (const entry of stored ?? []) {
    if (!entry || typeof entry.id !== 'string') continue
    if (!isWidgetId(entry.id)) continue
    const id = entry.id
    if (!allowed.has(id) || seen.has(id)) continue
    result.push({
      id,
      // Required widgets can never be disabled; everything else honours the stored flag
      // (defaulting to enabled when the flag is absent).
      enabled: required.has(id) ? true : entry.enabled !== false,
      settings: isPlainObject(entry.settings) ? entry.settings : {},
    })
    seen.add(id)
  }

  // 2. Append any default widgets the stored config didn't mention, in default order.
  for (const id of DEFAULT_LAYOUT[mode]) {
    if (seen.has(id)) continue
    result.push({ id, enabled: true, settings: {} })
    seen.add(id)
  }

  // 3. Inject any REQUIRED widget still missing (e.g. removed from the default list above) at
  //    the front, in required order, so the spine of the page is guaranteed.
  const missingRequired = REQUIRED_WIDGETS[mode].filter((id) => !seen.has(id))
  if (missingRequired.length > 0) {
    result.unshift(...missingRequired.map((id) => ({ id, enabled: true, settings: {} as Record<string, unknown> })))
  }

  return result
}

/** Just the enabled widgets, in order — the common case for the renderer. */
export function enabledWidgets(
  stored: PageWidgetConfig[] | null | undefined,
  mode: JourneyPageMode,
): ResolvedWidget[] {
  return normalizePageConfig(stored, mode).filter((w) => w.enabled)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ── Editor catalog ────────────────────────────────────────────────────────────
// The Studio "Page layout" section renders from the SAME ids the page renders, so the
// two can never drift (the old fallback catalog used ids the page silently dropped).

/** Editor-facing label + one-line hint + which face each widget belongs to. */
export const WIDGET_META: Record<WidgetId, { label: string; hint: string; mode: JourneyPageMode }> = {
  'next-step': { label: 'Next step card', hint: 'The dominant log target — the current practice. (Always on.)', mode: 'active' },
  'gamification': { label: 'Gamification panel', hint: 'Zaps · rank · streak · Gems at a glance. (Always on.)', mode: 'active' },
  'progress': { label: 'Season progress', hint: 'Week N of 13 and qualifying weeks toward completion.', mode: 'active' },
  'checklist': { label: 'Step checklist', hint: 'Every step with its on-track / behind state.', mode: 'active' },
  'streak': { label: 'Streak & shields', hint: 'The daily streak and earned freeze shields.', mode: 'active' },
  'companions': { label: 'Chorus companions', hint: 'Members of your circles on this Journey.', mode: 'active' },
  'practice-guide': { label: 'Practice guide', hint: 'The author’s how-to / story (markdown), read while practising.', mode: 'active' },
  'story': { label: 'The story', hint: 'The intro markdown — why this Journey exists.', mode: 'discovery' },
  'path': { label: 'The path', hint: 'The ordered steps with cadence, note, and tier. (Always on.)', mode: 'discovery' },
  'pillar-balance': { label: 'Pillar balance', hint: 'How the path spreads across the four Pillars.', mode: 'discovery' },
  'social-proof': { label: 'Social proof', hint: 'How many people have adopted this Journey.', mode: 'discovery' },
  'reward-preview': { label: 'Reward preview', hint: 'What completing the Journey pays out (Gems + badge).', mode: 'discovery' },
  'completion-rule': { label: 'Completion rule', hint: 'The completion bar — N qualifying weeks of 13.', mode: 'discovery' },
}

/**
 * The full, ordered widget catalog for the Studio editor (both faces), merging a stored
 * config: stored order/flags first for known ids, then any remaining widgets in default order.
 * Required widgets are forced on. Returns one PageWidgetConfig[] the editor edits and saves; the
 * page's mode-specific normalizePageConfig() then filters it per face.
 */
export function editorPageConfig(stored: PageWidgetConfig[] | null | undefined): PageWidgetConfig[] {
  const requiredAll = new Set<WidgetId>([...REQUIRED_WIDGETS.active, ...REQUIRED_WIDGETS.discovery])
  const order: WidgetId[] = []
  const seen = new Set<WidgetId>()
  for (const e of stored ?? []) {
    if (e && isWidgetId(e.id) && !seen.has(e.id)) {
      order.push(e.id)
      seen.add(e.id)
    }
  }
  for (const id of [...DEFAULT_LAYOUT.active, ...DEFAULT_LAYOUT.discovery]) {
    if (!seen.has(id)) {
      order.push(id)
      seen.add(id)
    }
  }
  // First occurrence wins for the flag/settings too (mirrors the de-duped order above).
  const storedById = new Map<WidgetId, PageWidgetConfig>()
  for (const e of stored ?? []) {
    if (e && isWidgetId(e.id) && !storedById.has(e.id)) storedById.set(e.id, e)
  }
  return order.map((id) => {
    const e = storedById.get(id)
    const enabled = requiredAll.has(id) ? true : e ? e.enabled !== false : true
    return e?.settings ? { id, enabled, settings: e.settings } : { id, enabled }
  })
}

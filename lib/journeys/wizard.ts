// Journeys — the guided creation wizard's state + phase model (ADR-839).
//
// The creation flow is FIVE phases: Spark and Review run before a row exists (the
// JourneySpark component, nothing persists until the reviewed title commits), then the
// GUIDE (/journeys/<slug>/guide) walks the remaining three over the real row:
//   3. Shape    — the block-tree scaffold: pick a template when empty, see + grow the phases.
//   4. Schedule — run-between dates (window_starts_at/ends_at) + the phase drip cadence.
//   5. Ready    — the ready-check summary + publish through setJourneyVisibility.
//
// SINGLE SOURCE OF TRUTH: the plan row + journey_plan_items. The wizard state stored here
// tracks ONLY progress + choices (which guide phases are done, where the member came in),
// never content — so toggling to the editor and back can never fork the data.
//
// WHERE IT LIVES: one reserved entry in journey_plans.page_config (`{ id: 'wizard',
// enabled: false, settings: <JourneyWizardState> }`). page_config is a closed-union widget
// list, so every renderer (normalizePageConfig / editorPageConfig) already drops the unknown
// 'wizard' id on read; the write paths preserve it (see setJourneyPageConfig).
//
// PURE + dependency-light (only the PageWidgetConfig shape), so it is safe to import from
// Server Components, the client guide, and vitest alike.

import type { PageWidgetConfig } from '@/lib/journey-plans'

/** The reserved page_config entry id the wizard state rides in. Not a widget id, so the
 *  page renderers drop it and the layout editor never lists it. */
export const WIZARD_ENTRY_ID = 'wizard'

/** The guide's post-creation phases, in order. Spark + Review run before the row exists,
 *  so they are complete by definition once a guide phase is reachable. */
export const GUIDE_PHASES = ['shape', 'schedule', 'ready'] as const
export type GuidePhase = (typeof GUIDE_PHASES)[number]

/** How the member entered the guided flow (recorded at creation, for resume copy). */
export type WizardOrigin = 'spark' | 'template' | 'framework'

export interface JourneyWizardState {
  v: 1
  /** Guide phases the member finished (marked on Continue / on publish). */
  completed: GuidePhase[]
  /** Choices made on the way in. Progress metadata only, never content. */
  choices: {
    origin?: WizardOrigin
    templateId?: string
  }
  updatedAt: string
}

export function isGuidePhase(value: unknown): value is GuidePhase {
  return typeof value === 'string' && (GUIDE_PHASES as readonly string[]).includes(value)
}

/** A fresh wizard state (creation seeds one so the guide is resumable from the start). */
export function newWizardState(choices: JourneyWizardState['choices'] = {}, now: Date = new Date()): JourneyWizardState {
  return { v: 1, completed: [], choices, updatedAt: now.toISOString() }
}

/** Read the wizard state out of a stored page_config. Null when absent or malformed
 *  (a malformed entry reads as "no wizard in progress", never throws). */
export function readWizardState(stored: PageWidgetConfig[] | null | undefined): JourneyWizardState | null {
  for (const entry of stored ?? []) {
    if (!entry || entry.id !== WIZARD_ENTRY_ID) continue
    const s = entry.settings
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null
    const raw = s as Record<string, unknown>
    if (raw.v !== 1) return null
    const completed = Array.isArray(raw.completed) ? raw.completed.filter(isGuidePhase) : []
    const choicesRaw = raw.choices && typeof raw.choices === 'object' && !Array.isArray(raw.choices)
      ? (raw.choices as Record<string, unknown>)
      : {}
    const origin = choicesRaw.origin
    const templateId = choicesRaw.templateId
    return {
      v: 1,
      completed: [...new Set(completed)],
      choices: {
        ...(origin === 'spark' || origin === 'template' || origin === 'framework' ? { origin } : {}),
        ...(typeof templateId === 'string' && templateId ? { templateId } : {}),
      },
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    }
  }
  return null
}

/** Write the wizard state into a page_config, preserving every other entry (widget order,
 *  flags, settings) untouched. Returns a NEW array; the input is never mutated. */
export function writeWizardState(
  stored: PageWidgetConfig[] | null | undefined,
  state: JourneyWizardState,
): PageWidgetConfig[] {
  const rest = (stored ?? []).filter((e) => e && e.id !== WIZARD_ENTRY_ID)
  return [...rest, { id: WIZARD_ENTRY_ID, enabled: false, settings: state as unknown as Record<string, unknown> }]
}

/** Mark one guide phase complete (idempotent). Returns a NEW state. */
export function markPhaseComplete(
  state: JourneyWizardState | null,
  phase: GuidePhase,
  now: Date = new Date(),
): JourneyWizardState {
  const base = state ?? newWizardState({}, now)
  return {
    ...base,
    completed: base.completed.includes(phase) ? base.completed : [...base.completed, phase],
    updatedAt: now.toISOString(),
  }
}

/** The phase a resuming member lands on: the FIRST guide phase not yet completed, in
 *  order. Everything done → 'ready' (the summary is always a sane place to stand). */
export function furthestIncompletePhase(state: JourneyWizardState | null): GuidePhase {
  for (const phase of GUIDE_PHASES) {
    if (!state?.completed.includes(phase)) return phase
  }
  return 'ready'
}

/** Is the guided flow still in progress (some guide phase not done)? Used by the resume
 *  affordance on /journeys/new. A published Journey never counts as in progress. */
export function wizardInProgress(state: JourneyWizardState | null, visibility: string | null): boolean {
  if (!state) return false
  if (visibility && visibility !== 'private') return false
  return GUIDE_PHASES.some((p) => !state.completed.includes(p))
}

// ── Plain-language previews (Schedule phase) ────────────────────────────────────────────

/** yyyy-mm-dd (or ISO) → "May 1, 2026". Rendered in UTC so the label matches the stored
 *  date everywhere. Empty/unparseable input → null. */
export function formatWindowDate(value: string | null | undefined): string | null {
  const t = (value ?? '').trim()
  if (!t) return null
  const ms = Date.parse(t.length === 10 ? `${t}T00:00:00Z` : t)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** The drip cadence in plain words, e.g. "A new phase unlocks every 3 days." */
export function dripPreview(dripIntervalDays: number, phaseCount: number): string {
  const interval = Math.floor(dripIntervalDays)
  if (interval <= 0) return 'Every phase opens right away.'
  const cadence =
    interval === 1
      ? 'A new phase unlocks every day.'
      : interval === 7
        ? 'A new phase unlocks every week.'
        : interval === 14
          ? 'A new phase unlocks every two weeks.'
          : `A new phase unlocks every ${interval} days.`
  if (phaseCount > 1) {
    // Phase 1 opens on day 1; phase N opens on day (N-1)*interval + 1 (lib/journeys/schedule.ts).
    const lastDay = (phaseCount - 1) * interval + 1
    return `${cadence} The last of your ${phaseCount} phases opens on day ${lastDay}.`
  }
  return cadence
}

/** The run window in plain words, e.g. "Runs May 1, 2026 to May 28, 2026." */
export function windowPreview(startsAt: string | null | undefined, endsAt: string | null | undefined): string {
  const start = formatWindowDate(startsAt)
  const end = formatWindowDate(endsAt)
  if (start && end) return `Runs ${start} to ${end}.`
  if (start) return `Starts ${start}. No close date.`
  if (end) return `Open now. Closes ${end}.`
  return 'Open anytime. Members start whenever they join.'
}

// ── Ready-check (Ready phase) ───────────────────────────────────────────────────────────

export interface ReadyCheckInput {
  title: string
  summary: string | null
  intro: string | null
  coverImage: string | null
  phaseCount: number
  stepCount: number
  dripIntervalDays: number
  windowStartsAt: string | null
  windowEndsAt: string | null
}

export interface ReadyCheckItem {
  key: 'name' | 'promise' | 'story' | 'cover' | 'structure' | 'schedule'
  label: string
  /** Set = the box is ticked. */
  ok: boolean
  /** Required items block the "ready" verdict; the rest are recommendations. */
  required: boolean
  /** One plain line of context (what is set, or what to do). */
  detail: string
}

const UNTITLED = 'untitled journey'

/** The Ready phase's checklist, derived ENTIRELY from the plan row + item counts (never
 *  from wizard state), so edits made in the editor show up here immediately. */
export function readyCheck(input: ReadyCheckInput): ReadyCheckItem[] {
  const named = input.title.trim().length > 0 && input.title.trim().toLowerCase() !== UNTITLED
  const hasStructure = input.phaseCount > 0 && input.stepCount > 0
  return [
    {
      key: 'name',
      label: 'A real name',
      ok: named,
      required: true,
      detail: named ? input.title.trim() : 'Give it a name people would say out loud.',
    },
    {
      key: 'promise',
      label: 'A one-line promise',
      ok: !!input.summary?.trim(),
      required: false,
      detail: input.summary?.trim() ? input.summary.trim() : 'One line on what people walk away with.',
    },
    {
      key: 'story',
      label: 'An introduction',
      ok: !!input.intro?.trim(),
      required: false,
      detail: input.intro?.trim() ? 'Your introduction is in.' : 'A few lines on why this Journey exists.',
    },
    {
      key: 'cover',
      label: 'A cover image',
      ok: !!input.coverImage,
      required: false,
      detail: input.coverImage ? 'Cover set.' : 'A cover makes the card pop in the library.',
    },
    {
      key: 'structure',
      label: 'Phases with steps inside',
      ok: hasStructure,
      required: true,
      detail: hasStructure
        ? `${input.phaseCount} ${input.phaseCount === 1 ? 'phase' : 'phases'}, ${input.stepCount} ${input.stepCount === 1 ? 'step' : 'steps'}.`
        : 'Add at least one phase with a step in it.',
    },
    {
      key: 'schedule',
      label: 'A schedule',
      ok: true,
      required: false,
      detail: `${windowPreview(input.windowStartsAt, input.windowEndsAt)} ${dripPreview(input.dripIntervalDays, input.phaseCount)}`,
    },
  ]
}

/** May this Journey be published? Every REQUIRED ready-check item is set. (The publish
 *  chokepoint setJourneyVisibility still enforces the real caps server-side.) */
export function readyToPublish(items: ReadyCheckItem[]): boolean {
  return items.every((i) => i.ok || !i.required)
}

/** Who can see the Journey at a given visibility, in plain words (the Ready phase's
 *  "who can see it" line). */
export function whoCanSee(visibility: string): string {
  if (visibility === 'public') return 'Listed in the community library. Anyone can find it.'
  if (visibility === 'unlisted') return 'Live for anyone with the link, and on your Space if it has one. Not listed in the library.'
  return 'Only you and your Space team. Members cannot see a private draft.'
}

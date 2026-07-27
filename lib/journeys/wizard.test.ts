import { describe, expect, it } from 'vitest'
import type { PageWidgetConfig } from '@/lib/journey-plans'
import {
  WIZARD_ENTRY_ID,
  GUIDE_PHASES,
  newWizardState,
  readWizardState,
  writeWizardState,
  markPhaseComplete,
  furthestIncompletePhase,
  wizardInProgress,
  dripPreview,
  windowPreview,
  formatWindowDate,
  readyCheck,
  readyToPublish,
  whoCanSee,
  type ReadyCheckInput,
} from './wizard'

const NOW = new Date('2026-07-27T12:00:00Z')

describe('wizard state read/write on page_config', () => {
  it('round-trips a state through a page_config entry', () => {
    const state = markPhaseComplete(newWizardState({ origin: 'spark' }, NOW), 'shape', NOW)
    const stored = writeWizardState(null, state)
    const read = readWizardState(stored)
    expect(read).not.toBeNull()
    expect(read!.completed).toEqual(['shape'])
    expect(read!.choices.origin).toBe('spark')
    expect(read!.updatedAt).toBe(NOW.toISOString())
  })

  it('preserves widget entries (order, flags, settings) when writing', () => {
    const widgets: PageWidgetConfig[] = [
      { id: 'path', enabled: true },
      { id: 'story', enabled: false, settings: { foo: 1 } },
    ]
    const out = writeWizardState(widgets, newWizardState({}, NOW))
    expect(out.slice(0, 2)).toEqual(widgets)
    expect(out[2].id).toBe(WIZARD_ENTRY_ID)
    // The wizard entry never renders as a widget.
    expect(out[2].enabled).toBe(false)
    // Input untouched.
    expect(widgets).toHaveLength(2)
  })

  it('replaces an existing wizard entry instead of stacking', () => {
    const first = writeWizardState([{ id: 'path', enabled: true }], newWizardState({}, NOW))
    const second = writeWizardState(first, markPhaseComplete(readWizardState(first), 'shape', NOW))
    expect(second.filter((e) => e.id === WIZARD_ENTRY_ID)).toHaveLength(1)
    expect(readWizardState(second)!.completed).toEqual(['shape'])
  })

  it('reads null on absent, malformed, or wrong-version entries', () => {
    expect(readWizardState(null)).toBeNull()
    expect(readWizardState([{ id: 'path', enabled: true }])).toBeNull()
    expect(readWizardState([{ id: WIZARD_ENTRY_ID, enabled: false, settings: { v: 2 } }])).toBeNull()
    expect(readWizardState([{ id: WIZARD_ENTRY_ID, enabled: false }])).toBeNull()
  })

  it('drops unknown completed values and dedupes', () => {
    const stored: PageWidgetConfig[] = [
      {
        id: WIZARD_ENTRY_ID,
        enabled: false,
        settings: { v: 1, completed: ['shape', 'shape', 'bogus'], choices: {}, updatedAt: 'x' },
      },
    ]
    expect(readWizardState(stored)!.completed).toEqual(['shape'])
  })
})

describe('phase progression', () => {
  it('walks the guide phases in order', () => {
    let state = newWizardState({}, NOW)
    expect(furthestIncompletePhase(state)).toBe('shape')
    state = markPhaseComplete(state, 'shape', NOW)
    expect(furthestIncompletePhase(state)).toBe('schedule')
    state = markPhaseComplete(state, 'schedule', NOW)
    expect(furthestIncompletePhase(state)).toBe('ready')
    state = markPhaseComplete(state, 'ready', NOW)
    expect(furthestIncompletePhase(state)).toBe('ready')
  })

  it('lands on the FIRST incomplete phase even when a later one is done', () => {
    const state = markPhaseComplete(newWizardState({}, NOW), 'schedule', NOW)
    expect(furthestIncompletePhase(state)).toBe('shape')
  })

  it('null state starts at the first guide phase', () => {
    expect(furthestIncompletePhase(null)).toBe(GUIDE_PHASES[0])
  })

  it('marking is idempotent', () => {
    const once = markPhaseComplete(newWizardState({}, NOW), 'shape', NOW)
    const twice = markPhaseComplete(once, 'shape', NOW)
    expect(twice.completed).toEqual(['shape'])
  })

  it('wizardInProgress: true mid-flow, false when done or published', () => {
    const mid = markPhaseComplete(newWizardState({}, NOW), 'shape', NOW)
    expect(wizardInProgress(mid, 'private')).toBe(true)
    expect(wizardInProgress(mid, 'unlisted')).toBe(false)
    let done = mid
    for (const p of GUIDE_PHASES) done = markPhaseComplete(done, p, NOW)
    expect(wizardInProgress(done, 'private')).toBe(false)
    expect(wizardInProgress(null, 'private')).toBe(false)
  })
})

describe('plain-language previews', () => {
  it('formats window dates in UTC', () => {
    expect(formatWindowDate('2026-05-01')).toBe('May 1, 2026')
    expect(formatWindowDate('')).toBeNull()
    expect(formatWindowDate('not a date')).toBeNull()
  })

  it('drip cadence sentences', () => {
    expect(dripPreview(3, 1)).toBe('A new phase unlocks every 3 days.')
    expect(dripPreview(1, 1)).toBe('A new phase unlocks every day.')
    expect(dripPreview(7, 1)).toBe('A new phase unlocks every week.')
    expect(dripPreview(14, 1)).toBe('A new phase unlocks every two weeks.')
    expect(dripPreview(0, 4)).toBe('Every phase opens right away.')
  })

  it('drip preview names the last unlock day', () => {
    // Phase 1 on day 1, then every 3 days: 4 phases → day 10.
    expect(dripPreview(3, 4)).toBe('A new phase unlocks every 3 days. The last of your 4 phases opens on day 10.')
    expect(dripPreview(7, 6)).toBe('A new phase unlocks every week. The last of your 6 phases opens on day 36.')
  })

  it('window sentences cover all four shapes', () => {
    expect(windowPreview('2026-05-01', '2026-05-28')).toBe('Runs May 1, 2026 to May 28, 2026.')
    expect(windowPreview('2026-05-01', null)).toBe('Starts May 1, 2026. No close date.')
    expect(windowPreview(null, '2026-05-28')).toBe('Open now. Closes May 28, 2026.')
    expect(windowPreview(null, null)).toBe('Open anytime. Members start whenever they join.')
  })
})

describe('ready-check', () => {
  const base: ReadyCheckInput = {
    title: 'Calmer Mornings',
    summary: 'Keep a ten minute routine that sticks.',
    intro: 'Why this exists.',
    coverImage: 'https://example.com/c.jpg',
    phaseCount: 4,
    stepCount: 12,
    dripIntervalDays: 7,
    windowStartsAt: null,
    windowEndsAt: null,
  }

  it('a complete plan is ready', () => {
    const items = readyCheck(base)
    expect(items.every((i) => i.ok)).toBe(true)
    expect(readyToPublish(items)).toBe(true)
  })

  it('an untitled or structureless plan is not ready', () => {
    expect(readyToPublish(readyCheck({ ...base, title: 'Untitled journey' }))).toBe(false)
    expect(readyToPublish(readyCheck({ ...base, stepCount: 0 }))).toBe(false)
    expect(readyToPublish(readyCheck({ ...base, phaseCount: 0 }))).toBe(false)
  })

  it('missing recommendations never block publishing', () => {
    const items = readyCheck({ ...base, summary: null, intro: null, coverImage: null })
    expect(items.find((i) => i.key === 'promise')!.ok).toBe(false)
    expect(items.find((i) => i.key === 'cover')!.ok).toBe(false)
    expect(readyToPublish(items)).toBe(true)
  })

  it('the structure detail counts phases and steps', () => {
    const item = readyCheck(base).find((i) => i.key === 'structure')!
    expect(item.detail).toBe('4 phases, 12 steps.')
  })

  it('whoCanSee covers the three visibilities', () => {
    expect(whoCanSee('private')).toContain('Only you')
    expect(whoCanSee('unlisted')).toContain('link')
    expect(whoCanSee('public')).toContain('library')
  })
})

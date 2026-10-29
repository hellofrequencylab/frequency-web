import { describe, it, expect } from 'vitest'
import {
  CANCEL_WINDOW_MS, canConfirmCancel, isActive, launchPhase, normalizeSteps, publishStep, resumeStep, skipPhoto, skipStep, stageOf, startStep, stepsWithSkips, toSnapshot,
} from './state'

const t0 = new Date('2026-10-28T12:00:00Z')
const later = (ms: number) => new Date(t0.getTime() + ms)

describe('launch save and resume (VLS-01)', () => {
  it('publishes step 1, is abandoned at step 3, and resumes at step 3 with step 1 still published', () => {
    let steps = publishStep(startStep({}, 'spotlight', t0), 'spotlight', later(1000), 'my-space')
    steps = publishStep(startStep(steps, 'space', later(2000)), 'space', later(3000))
    steps = startStep(steps, 'offer', later(4000))
    const row = { id: 'l1', owner_id: 'p1', started_at: t0.toISOString(), updated_at: later(4000).toISOString(), niche: 'coaches', intents: [], steps, current_step: 'offer' }
    const reloaded = toSnapshot(JSON.parse(JSON.stringify(row)))!
    expect(reloaded.currentStep).toBe('offer')
    expect(reloaded.steps.spotlight).toMatchObject({ status: 'published', ref: 'my-space' })
    expect(resumeStep('coaches', [], reloaded.steps)).toBe('offer')
  })

  it('never undoes a settled step by reopening it, and keeps when a step started', () => {
    const done = publishStep(startStep({}, 'spotlight', t0), 'spotlight', later(1))
    expect(startStep(done, 'spotlight', later(99))).toBe(done)
    expect(done.spotlight?.startedAt).toBe(t0.toISOString())
  })

  it('will not skip a required step, and skipping a published step leaves it published', () => {
    expect(skipStep({}, 'spotlight', t0)).toBeNull()
    expect(skipStep({}, 'website', t0)).toBeNull()
    expect(skipStep({}, 'people', t0)).toBeNull()
    expect(skipStep({}, 'offer', t0)?.offer?.status).toBe('skipped')
    const published = publishStep({}, 'offer', t0)
    expect(skipStep(published, 'offer', later(5))).toBe(published)
  })

  it('resumes at the first unsettled step in the person\'s own order, and at null when all are settled', () => {
    expect(resumeStep('coaches', [], {})).toBe('spotlight')
    expect(resumeStep('coaches', ['events'], publishStep({}, 'spotlight', t0))).toBe('space')
    const all = ['spotlight', 'space', 'offer', 'website', 'event', 'circle', 'journey', 'people', 'paid'] as const
    let steps = {}
    for (const id of all) steps = publishStep(steps, id, t0)
    expect(resumeStep('coaches', [], steps)).toBeNull()
  })

  it('drops junk from a hand-edited row instead of throwing', () => {
    expect(normalizeSteps(null)).toEqual({})
    expect(normalizeSteps([])).toEqual({})
    const out = normalizeSteps({
      spotlight: { status: 'published', publishedAt: 'not a date', ref: 'x'.repeat(500) },
      wizard: { status: 'published' },
      space: { status: 'done' },
      offer: 'nope',
    })
    expect(out).toEqual({ spotlight: { status: 'published' } })
  })

  it('reads a row defensively: missing keys give null, a junk cursor falls back to the resume step', () => {
    expect(toSnapshot(null)).toBeNull()
    expect(toSnapshot({ id: 'l1' })).toBeNull()
    const snap = toSnapshot({ id: 'l1', owner_id: 'p1', started_at: t0.toISOString(), updated_at: t0.toISOString(), current_step: 'bogus', steps: {}, intents: [1, 'events'] })!
    expect(snap.currentStep).toBe('spotlight')
    expect(snap.intents).toEqual(['events'])
    expect(snap.stage).toBe('found')
  })

  it('maps each step to its stage', () => {
    expect(stageOf('spotlight')).toBe('found')
    expect(stageOf('circle')).toBe('gather')
    expect(stageOf('paid')).toBe('keep')
  })
})

describe('launch cancel is two calls (VLS-01)', () => {
  const base = { cancelRequestedAt: null, cancelledAt: null, completedAt: null }

  it('a single call with no prior request leaves the launch active', () => {
    expect(canConfirmCancel(base, 'STOP', t0)).toEqual({ ok: false, reason: 'not_requested' })
    expect(launchPhase(base, t0)).toBe('active')
  })

  it('needs the typed word after the request, not before and not wrong', () => {
    const requested = { ...base, cancelRequestedAt: t0.toISOString() }
    expect(launchPhase(requested, later(1000))).toBe('cancel_requested')
    expect(canConfirmCancel(requested, 'stop', later(1000))).toEqual({ ok: true })
    expect(canConfirmCancel(requested, ' STOP ', later(1000))).toEqual({ ok: true })
    expect(canConfirmCancel(requested, 'yes', later(1000))).toEqual({ ok: false, reason: 'wrong_word' })
    expect(canConfirmCancel(requested, undefined, later(1000))).toEqual({ ok: false, reason: 'wrong_word' })
  })

  it('a stale request expires and the launch reads as active again', () => {
    const requested = { ...base, cancelRequestedAt: t0.toISOString() }
    expect(canConfirmCancel(requested, 'STOP', later(CANCEL_WINDOW_MS + 1))).toEqual({ ok: false, reason: 'expired' })
    expect(launchPhase(requested, later(CANCEL_WINDOW_MS + 1))).toBe('active')
  })

  it('an ended launch cannot be cancelled, and is not active', () => {
    const cancelled = { ...base, cancelRequestedAt: t0.toISOString(), cancelledAt: later(5).toISOString() }
    expect(isActive(cancelled)).toBe(false)
    expect(canConfirmCancel(cancelled, 'STOP', later(10))).toEqual({ ok: false, reason: 'not_active' })
    expect(launchPhase({ ...base, completedAt: t0.toISOString() }, later(10))).toBe('completed')
  })
})

describe('skipped photos', () => {
  it('remember a skip in the steps column, and it survives a reload', () => {
    const skipped = skipPhoto([], 'sc-cover')
    expect(skipped).toEqual(['sc-cover'])
    const row = { id: 'l1', owner_id: 'p1', started_at: t0.toISOString(), updated_at: t0.toISOString(), steps: JSON.parse(JSON.stringify(stepsWithSkips({}, skipped!))) }
    expect(toSnapshot(row)?.skippedPhotos).toEqual(['sc-cover'])
  })
  it('is idempotent, refuses a non-photo item, and drops junk', () => {
    expect(skipPhoto(['sc-cover'], 'sc-cover')).toEqual(['sc-cover'])
    expect(skipPhoto([], 'w-site')).toBeNull()
    const snap = (steps: unknown) => toSnapshot({ id: "l1", owner_id: "p1", started_at: t0.toISOString(), updated_at: t0.toISOString(), steps })
    expect(snap({ photoSkips: ["sc-logo", "junk", 4] })?.skippedPhotos).toEqual(["sc-logo"])
    expect(snap(null)?.skippedPhotos).toEqual([])
  })
  it('does not disturb the step record', () => {
    const steps = publishStep({}, 'spotlight', t0, 'a-space')
    expect(normalizeSteps(stepsWithSkips(steps, ['sc-logo']))).toEqual(steps)
    expect(stepsWithSkips(steps, [])).toEqual(steps)
  })
})

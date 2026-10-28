import { describe, expect, it } from 'vitest'
import { agoLabel, resumeView } from './resume'
import { toSnapshot } from './state'
import { launchStepHref } from './steps'

const NOW = new Date('2026-10-28T12:00:00Z')
const row = (over: Record<string, unknown> = {}) =>
  toSnapshot({ id: 'l1', owner_id: 'p1', niche: 'coaches', started_at: '2026-10-26T12:00:00Z', updated_at: '2026-10-26T12:00:00Z', steps: {}, ...over })!

describe('resumeView', () => {
  it('lands a new launch on its first step', () => {
    expect(resumeView(row(), NOW)).toMatchObject({ kind: 'step', step: 'spotlight', href: '/launch/step/spotlight', savedAgo: '2 days ago', made: [] })
  })

  it('lands on the first step not yet published or skipped and lists what is made', () => {
    const steps = { spotlight: { status: 'published' }, space: { status: 'published' }, offer: { status: 'skipped' } }
    expect(resumeView(row({ steps }), NOW)).toMatchObject({ kind: 'step', step: 'website', label: 'Website', made: ['Spotlight', 'Your Space'] })
  })

  it('offers a restart for a stopped launch, even with steps made', () => {
    expect(resumeView(row({ cancelled_at: '2026-10-27T12:00:00Z', steps: { spotlight: { status: 'published' } } }), NOW)).toEqual({ kind: 'restart' })
  })

  it('says complete for a finished launch', () => {
    expect(resumeView(row({ completed_at: '2026-10-27T12:00:00Z' }), NOW)).toEqual({ kind: 'complete' })
  })

  it('keeps a launch whose stop was only asked for running', () => {
    expect(resumeView(row({ cancel_requested_at: '2026-10-28T11:55:00Z' }), NOW).kind).toBe('step')
  })

  it('points the paid step at its get-paid screen', () => {
    expect(launchStepHref('paid')).toBe('/launch/step/get-paid')
  })
})

describe('agoLabel', () => {
  it('reads minutes, hours and days, and a junk or future time as just now', () => {
    expect(agoLabel('2026-10-28T11:59:30Z', NOW)).toBe('just now')
    expect(agoLabel('2026-10-28T11:59:00Z', NOW)).toBe('1 minute ago')
    expect(agoLabel('2026-10-28T09:00:00Z', NOW)).toBe('3 hours ago')
    expect(agoLabel('2026-10-27T12:00:00Z', NOW)).toBe('1 day ago')
    expect(agoLabel('2026-10-29T12:00:00Z', NOW)).toBe('just now')
    expect(agoLabel('nope', NOW)).toBe('just now')
  })
})

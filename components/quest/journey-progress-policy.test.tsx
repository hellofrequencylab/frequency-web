import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/app/(main)/crew/gamification-actions', () => ({ completeExpression: async () => ({ ok: true }) }))
vi.mock('@/app/(main)/crew/challenges/expression-action', () => ({ ExpressionAction: () => <button>Choose Expression</button> }))
import { JourneyProgressCard } from './journey-progress-card'
function render(node: React.ReactNode) {
  const document = new JSDOM(renderToStaticMarkup(node)).window.document
  return { document, text: document.body.textContent ?? '' }
}
const base = { planId: 'journey', slug: 'quiet-time', title: 'Quiet time', inCohort: false, finished: false,
  distinctDays: 12, daysRequired: 14, hasExpression: true, expressionDone: false,
  windowStartsAt: '2026-11-01', windowEndsAt: '2026-11-28', learnHref: '/journeys/quiet-time/learn' }

describe('recorded optional Expression contract', () => {
  it('explains optional and private participation only on the prospective contract', () => {
    const prospective = render(<JourneyProgressCard {...base} policyVersion={2} />)
    expect(prospective.text).toContain('Expression is an optional invitation and can stay private')
    expect(prospective.text).toContain('Expression invitation: make, share or connect')
    const legacy = render(<JourneyProgressCard {...base} />)
    expect(legacy.text).not.toContain('Expression is an optional invitation')
    expect(legacy.text).toContain('Expression Challenge: share what you practiced')
  })
  it('does not pretend optional Expression was done when the Journey was finished', () => {
    const result = render(<JourneyProgressCard {...base} finished policyVersion={2} />)
    expect(result.text).toContain('You finished this Journey')
    expect(result.text).not.toContain('Expression Challenge done')
    expect(result.text).toContain('Expression invitation, whenever you choose')
  })
  it('offers optional Expression before the day bar is near completion', () => {
    const result = render(<JourneyProgressCard {...base} distinctDays={0} policyVersion={2} />)
    expect(result.text).toContain('Choose Expression')
  })
  it('retains the optional action after a Journey finishes until Expression is done', () => {
    const result = render(<JourneyProgressCard {...base} finished policyVersion={2} />)
    expect(result.text).toContain('Choose Expression')
    const done = render(<JourneyProgressCard {...base} finished policyVersion={2} expressionDone />)
    expect(done.text).not.toContain('Choose Expression')
  })
  it('uses optional action instructions while preserving existing reward modes', async () => {
    const { ExpressionAction } = await vi.importActual<typeof import('@/app/(main)/crew/challenges/expression-action')>('@/app/(main)/crew/challenges/expression-action')
    const optional = render(<ExpressionAction journeyId='journey' optional />)
    expect(optional.text).toContain('Keeping it private is welcome too.')
    expect(optional.text).not.toContain('to finish this Journey')
    expect(optional.text).toContain('Shared at a Circle')
    expect(optional.text).toContain('Posted it online')
    const legacy = render(<ExpressionAction journeyId='journey' />)
    expect(legacy.text).toContain('Share what you practiced to finish this Journey:')
  })
  it('labels missing historical support as a lower bound, not a definitive deficit', () => {
    const result = render(<JourneyProgressCard {...base} distinctDays={13} unknownSupportLogs={2} policyVersion={2} />)
    expect(result.text).toContain('At least 13/14 days')
    expect(result.text).toContain('missing support details')
    expect(result.text).not.toContain('1 to go')
    expect(result.document.querySelector('[role=progressbar]')?.getAttribute('aria-label')).toContain('At least')
  })
  it('keeps unavailable progress distinct from zero and preserves the next-step link', () => {
    const result = render(<JourneyProgressCard {...base} evidenceAvailable={false} />)
    expect(result.text).toContain('progress is unavailable')
    expect(result.document.querySelector('[role=progressbar]')).toBeNull()
    const link = [...result.document.querySelectorAll('a')].find((node) => node.textContent === 'Open this Journey')
    expect(link?.getAttribute('href')).toBe(base.learnHref)
  })
})

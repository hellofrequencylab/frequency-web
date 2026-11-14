import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencySignature } from './frequency-signature'
import { signatureForRhythm, computeSignature } from '@/lib/frequency-signature'
import { computePracticeRhythm, missingPracticeRhythm, practiceWindow, type PracticeRhythm } from '@/lib/frequency-rhythm'
import type { PillarSlug } from '@/lib/pillars/slugs'
const window = practiceWindow(new Date('2026-11-14T02:00:00Z'), 'America/Los_Angeles')
const pillars = new Map<string, PillarSlug>([['m', 'mind'], ['b', 'body'], ['s', 'spirit'], ['e', 'expression']])
const rhythm = computePracticeRhythm([{ id: 'a', logged_for: window.end, pillar_id: 'b', secondary_pillar_id: 'm', primary_pct: 75, practice: null }], pillars, window)
const render = (value: PracticeRhythm) => renderToStaticMarkup(<FrequencySignature signature={signatureForRhythm(value)} />)
describe('descriptive private practice graph', () => {
  it('uses the same recent day unit and window in geometry, summary and legend', () => {
    const html = render(rhythm)
    expect(html).toContain('Your recent practice rhythm')
    expect(html).toContain(window.start)
    expect(html).toContain(window.end)
    expect(html).toContain('America/Los_Angeles')
    expect(html).toContain('1 recorded practice day')
    expect(html).toContain('Mind: 1 recorded day')
    expect(html).toContain('Body: 1 recorded day')
    expect(html).toContain('These counts overlap')
    expect(html).toContain('var(--color-rank-jade, var(--rank-jade))')
    expect(html).toContain('Only you can see these practice details')
    expect(html).not.toMatch(/Grounded|Finding balance|full bloom|percent toward|% to full|color-success/)
  })
  it('does not draw a complete shape for partial evidence', () => {
    const html = render({ ...rhythm, complete: false, state: 'partial' })
    expect(html).toContain('partial counts')
    expect(html).toContain('At least 1 recorded practice day')
    expect(html).not.toContain('<svg')
  })
  it('keeps failure distinct from no recorded practice', () => {
    const html = render(missingPracticeRhythm('unavailable'))
    expect(html).toContain('couldn’t be loaded')
    expect(html).not.toContain('No practice is recorded')
  })
  it('does not claim missing legacy metadata means no practice', () => {
    const html = renderToStaticMarkup(<FrequencySignature signature={computeSignature({ body: 4 })} />)
    expect(html).toContain('couldn’t be loaded')
    expect(html).not.toContain('No practice is recorded')
  })
  it('welcomes quiet periods without prescribing equal activity', () => {
    const html = render(computePracticeRhythm([], pillars, window))
    expect(html).toContain('No practice is recorded in this window')
    expect(html).toContain('rest')
    expect(html).not.toMatch(/all four|Grounded|full bloom/)
  })
  it('returns no personal graph for a restricted viewer', () => {
    expect(render(missingPracticeRhythm('restricted'))).toBe('')
  })
  it('keeps compact failure and empty states inline and distinct', () => {
    const unavailable = renderToStaticMarkup(<FrequencySignature signature={signatureForRhythm(missingPracticeRhythm('unavailable'))} variant="compact" />)
    const empty = renderToStaticMarkup(<FrequencySignature signature={signatureForRhythm(computePracticeRhythm([], pillars, window))} variant="compact" />)
    expect(unavailable).toMatch(/^<span/)
    expect(unavailable).toContain('unavailable')
    expect(empty).toMatch(/^<span/)
    expect(empty).toContain('No recent practice recorded')
  })
  it('shows estimated and missing attribution rather than inventing support', () => {
    const html = render({ ...rhythm, coverage: { frozenLogs: 0, estimatedLogs: 2, unmappedLogs: 1 } })
    expect(html).toContain('2 older records use a current-category estimate')
    expect(html).toContain('Support details are missing for 1 record')
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { mindlessBlocks } from './mindless'
import { MINDLESS_KIT_CSS } from '@/lib/theme/mindless-kit-css'
import { MINDLESS_TIMER_CSS } from '@/lib/theme/mindless-timer-css'

const draw = (type: string, extra: Record<string, unknown> = {}) => {
  const c = mindlessBlocks[type]
  return renderToStaticMarkup((c.render as (p: Record<string, unknown>) => never)({ ...c.defaultProps, ...extra }))
}

describe('the Mindless block family', () => {
  it('draws every block in the design kit markup, each from its own defaults', () => {
    for (const type of Object.keys(mindlessBlocks)) expect(draw(type).length, type).toBeGreaterThan(80)
  })
  it('puts the blob behind the home hero, the words on the left and the photo on the right', () => {
    const html = draw('MindlessHero')
    expect(html).toContain('hero hero--blob')
    expect(html.indexOf('hero-copy')).toBeLessThan(html.indexOf('hero-blob-photo'))
    expect(MINDLESS_KIT_CSS).toContain('/sites/mindless/blob.jpg')
  })
  it('paints the key phrase and labels each section with torn tape', () => {
    expect(draw('MindlessSplit')).toContain('<em>countercultural.</em>')
    expect(draw('MindlessSplit')).toContain('ml-eyebrow-x--tape')
  })
  it('a circle with no date shows its word, never an empty date', () => {
    const html = draw('MindlessCircles', { rows: [{ month: 'Weekly', day: '', title: 'Mindless Encinitas' }] })
    expect(html).toContain('ml-circle__date--word')
    expect(html).not.toContain('ml-circle__day')
  })
  it('a drill with no link is a timer that runs in place, and a drill with a link stays a door', () => {
    const live = draw('MindlessPillars')
    expect(live).toContain('<button type="button" class="ml-player__play" aria-label="Start One-minute breath"')
    expect(live).toContain('role="progressbar"')
    expect(live).not.toContain('<a class="ml-player__play"')
    const door = draw('MindlessPillars', { drills: [{ title: 'The dish sit', length: '5:00', href: 'https://example.com/sit' }] })
    expect(door).toContain('<a class="ml-player__play" href="https://example.com/sit"')
    expect(door).not.toContain('<button')
  })
  it('the timer section offers its lengths and opens on the first, with the drip clock', () => {
    const html = draw('MindlessTimer')
    expect(html.match(/class="ml-choice[ "]/g)?.length).toBe(4)
    expect(html).toContain('class="ml-choice is-on" aria-pressed="true"')
    expect(html).toContain('ml-player--timer')
    expect(html).toContain('role="timer"')
    expect(html).toContain('aria-label="1:00 left"')
    // A length nobody can read is left out; with none left there is no timer to draw.
    expect(draw('MindlessTimer', { rows: [{ title: 'Soon', length: 'soon' }] })).not.toContain('ml-player')
  })
  it('the timer sheet names no colour of its own and only ever dresses a Mindless site', () => {
    expect(MINDLESS_TIMER_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    const selectors = MINDLESS_TIMER_CSS.replace(/@media[^{]*\{/g, '').split('}').map((r) => r.split('{')[0].trim()).filter(Boolean)
    for (const s of selectors) for (const one of s.split(',')) expect(one.trim().startsWith('[data-house-theme="mindless"]'), one).toBe(true)
  })
  it('the sheet only ever dresses a Mindless site', () => {
    const selectors = MINDLESS_KIT_CSS.replace(/@media[^{]*\{/g, '').split('}').map((r) => r.split('{')[0].trim()).filter((s) => s && !s.startsWith('@') && !/^(from|to|\d+%)/.test(s))
    for (const s of selectors) for (const one of s.split(',')) expect(one.trim().startsWith('[data-house-theme="mindless"]'), one).toBe(true)
  })
})

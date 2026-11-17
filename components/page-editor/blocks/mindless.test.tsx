import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { mindlessBlocks } from './mindless'
import { MINDLESS_KIT_CSS } from '@/lib/theme/mindless-kit-css'

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
  it('the sheet only ever dresses a Mindless site', () => {
    const selectors = MINDLESS_KIT_CSS.replace(/@media[^{]*\{/g, '').split('}').map((r) => r.split('{')[0].trim()).filter((s) => s && !s.startsWith('@') && !/^(from|to|\d+%)/.test(s))
    for (const s of selectors) for (const one of s.split(',')) expect(one.trim().startsWith('[data-house-theme="mindless"]'), one).toBe(true)
  })
})

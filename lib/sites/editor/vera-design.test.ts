import { describe, expect, it } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import { sectionDisplay } from './state'
import { readWebsiteVeraFacts } from './vera-guide'
import { applyWebsiteVeraLayout, describeWebsiteVeraChange, parseWebsiteVeraLayout, readWebsiteVeraStyleMenu, websiteVeraBlockOptions, websiteVeraOutline, type WebsiteVeraStyleMenu } from './vera-layout'

// LIVE-2162: Vera changes any design choice the editor offers (the Design tab's settings and each block's own design
// options), and can look at a screenshot the owner drops in. Words stay the owner's.

const config: Config = { components: {
  SpaceCTA: { label: 'Call to action card', fields: {
    heading: { type: 'text' },
    ctaHref: { type: 'text' },
    accent: { type: 'radio', label: 'Accent surface', options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] },
    headingStyle: { type: 'radio', label: 'Heading', options: [{ label: 'Big', value: 'big' }, { label: 'Small', value: 'small' }] },
    linkTarget: { type: 'select', label: 'Link', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
  }, render: () => null },
  Grid: { label: 'Grid', fields: { columns: { type: 'number' } }, render: () => null },
} }
const doc: Data = { root: {}, content: [
  { type: 'SpaceCTA', props: { id: 'SpaceCTA-1', heading: 'Find me locally', accent: 'yes' } },
  { type: 'Grid', props: { id: 'grid' } },
] }
const ids = new Set(['SpaceCTA-1', 'grid'])
const menu = (): WebsiteVeraStyleMenu => ({ dials: [], accents: [], accent: null, looks: [], options: websiteVeraBlockOptions(doc, config) })

describe('Vera changes any design choice the editor offers (LIVE-2162)', () => {
  it('offers only a block field with fixed choices that holds no words, link or id', () => {
    expect(websiteVeraBlockOptions(doc, config)).toEqual([
      { sectionId: 'SpaceCTA-1', field: 'accent', label: 'Accent surface', current: 'yes', choices: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] },
    ])
  })

  it('turns the card accent surface off, and refuses a choice or field the card does not offer', () => {
    const parsed = parseWebsiteVeraLayout({ changes: [
      { kind: 'option', sectionId: 'SpaceCTA-1', field: 'accent', choice: 'no' },
      { kind: 'option', sectionId: 'SpaceCTA-1', field: 'accent', choice: 'teal' },
      { kind: 'option', sectionId: 'SpaceCTA-1', field: 'heading', choice: 'no' },
      { kind: 'option', sectionId: 'SpaceCTA-1', field: 'accent', choice: 'no', text: 'Invented' },
    ] }, ids, menu())
    expect(parsed.changes).toEqual([{ kind: 'option', sectionId: 'SpaceCTA-1', field: 'accent', choice: 'no' }])
    expect(parsed.refused).toHaveLength(3)
    expect(describeWebsiteVeraChange(parsed.changes[0], doc, config)).toBe('Set Call to action card accent surface to No')
    const { doc: next, results } = applyWebsiteVeraLayout(doc, config, parsed.changes)
    expect(results[0].ok).toBe(true)
    expect(next.content[0].props).toEqual({ id: 'SpaceCTA-1', heading: 'Find me locally', accent: 'no' })
  })

  it('needs the menu for a block option, and re-checks it against the block config when applying', () => {
    expect(parseWebsiteVeraLayout({ changes: [{ kind: 'option', sectionId: 'SpaceCTA-1', field: 'accent', choice: 'no' }] }, ids).changes).toEqual([])
    const forged = applyWebsiteVeraLayout(doc, config, [{ kind: 'option', sectionId: 'SpaceCTA-1', field: 'heading', choice: 'Invented' }])
    expect(forged.results[0].ok).toBe(false)
    expect(forged.doc).toBe(doc)
  })

  it('sets every Design tab setting from its closed list, and theme clears it back', () => {
    const parsed = parseWebsiteVeraLayout({ changes: [
      { kind: 'design', sectionId: 'grid', setting: 'align', choice: 'center' },
      { kind: 'design', sectionId: 'grid', setting: 'spacing', choice: 'roomy' },
      { kind: 'design', sectionId: 'grid', setting: 'columns', choice: '2' },
      { kind: 'design', sectionId: 'grid', setting: 'reveal', choice: 'rise' },
      { kind: 'design', sectionId: 'grid', setting: 'headingFont', choice: 'mono' },
      { kind: 'design', sectionId: 'grid', setting: 'bodyFont', choice: 'display' },
      { kind: 'design', sectionId: 'grid', setting: 'spacing', choice: '999px' },
      { kind: 'design', sectionId: 'grid', setting: 'color', choice: 'red' },
    ] }, ids)
    expect(parsed.changes).toHaveLength(6)
    expect(parsed.refused).toHaveLength(2)
    const { doc: next } = applyWebsiteVeraLayout(doc, config, parsed.changes)
    expect(sectionDisplay(next, 'grid', 'desktop')).toEqual({ align: 'center', padding: 120, columns: 2, animation: 'rise', textFont: 'mono', bodyFont: 'display' })
    expect(websiteVeraOutline(next, config)[1].design).toEqual({ align: 'center', spacing: 'roomy', columns: '2', reveal: 'rise', headingFont: 'mono', bodyFont: 'display' })
    const cleared = applyWebsiteVeraLayout(next, config, [{ kind: 'design', sectionId: 'grid', setting: 'spacing', choice: 'theme' }]).doc
    expect(sectionDisplay(cleared, 'grid', 'desktop').padding).toBeUndefined()
    expect(describeWebsiteVeraChange({ kind: 'design', sectionId: 'grid', setting: 'spacing', choice: 'theme' }, doc, config)).toBe("Set Grid space above and below to your theme's own")
  })

  it('reads the block options on a menu that crossed the network, and refuses a malformed one', () => {
    expect(readWebsiteVeraStyleMenu(JSON.parse(JSON.stringify(menu())))?.options).toEqual(menu().options)
    expect(readWebsiteVeraStyleMenu({ ...menu(), options: [{ sectionId: 'SpaceCTA-1', field: 'accent', label: 'x', current: '', choices: [{ id: 'has space', label: 'x' }, { id: 'no', label: 'No' }] }] })).toBeNull()
  })
})

describe('a screenshot for Vera (LIVE-2162)', () => {
  const facts = { theme: 'New World', pageInView: 'Home', pages: [], checks: [], unpublished: [], published: true, scheduledFor: null }
  it('takes a small image data URL with the facts, and refuses anything else', () => {
    expect(readWebsiteVeraFacts({ ...facts, screenshot: 'data:image/jpeg;base64,AAAA' })?.screenshot).toBe('data:image/jpeg;base64,AAAA')
    expect(readWebsiteVeraFacts(facts)?.screenshot).toBeUndefined()
    expect(readWebsiteVeraFacts({ ...facts, screenshot: 'data:text/html;base64,AAAA' })).toBeNull()
    expect(readWebsiteVeraFacts({ ...facts, screenshot: 'https://example.com/a.png' })).toBeNull()
    expect(readWebsiteVeraFacts({ ...facts, screenshot: `data:image/png;base64,${'A'.repeat(1_600_000)}` })).toBeNull()
  })
})

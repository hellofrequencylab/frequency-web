import { describe, expect, it } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import { sectionDisplay, sectionVisibility } from './state'
import { VERA_SECTION_TONES, VERA_SECTION_WIDTHS, MAX_VERA_LAYOUT_CHANGES, applyWebsiteVeraLayout, describeWebsiteVeraChange, parseWebsiteVeraLayout, websiteVeraOutline } from './vera-layout'

const config: Config = { components: {
  Hero: { label: 'Hero', fields: { title: { type: 'text' } }, render: () => null },
  About: { label: 'About', fields: { body: { type: 'textarea' } }, render: () => null },
  Contact: { label: 'Contact', fields: {}, render: () => null },
} }
const doc: Data = { root: {}, content: [
  { type: 'Hero', props: { id: 'hero', title: 'My own headline' } },
  { type: 'Contact', props: { id: 'contact' } },
  { type: 'About', props: { id: 'about', body: 'My own story, word for word.' } },
] }
const ids = new Set(['hero', 'contact', 'about'])

describe('Vera layout vocabulary (LIVE-2097)', () => {
  it('keeps tone and width in lock-step with what the section renderer reads', () => {
    for (const tone of VERA_SECTION_TONES) expect(sectionDisplay({ root: { props: { websiteLayout: { a: { desktop: { tone } } } } }, content: [] }, 'a', 'desktop').tone).toBe(tone)
    for (const width of VERA_SECTION_WIDTHS) expect(sectionDisplay({ root: { props: { websiteLayout: { a: { desktop: { width } } } } }, content: [] }, 'a', 'desktop').width).toBe(width)
  })

  it('reads the page as an outline with positions and per-device visibility', () => {
    const outline = websiteVeraOutline(doc, config)
    expect(outline.map((s) => [s.id, s.position, s.label])).toEqual([['hero', 1, 'Hero'], ['contact', 2, 'Contact'], ['about', 3, 'About']])
    expect(outline[0].shows).toEqual({ desktop: true, tablet: true, phone: true })
  })

  it('parses every structural kind and refuses anything that carries words', () => {
    const parsed = parseWebsiteVeraLayout({ changes: [
      { kind: 'move', sectionId: 'about', toPosition: 2 },
      { kind: 'visibility', sectionId: 'contact', device: 'phone', visible: false },
      { kind: 'duplicate', sectionId: 'hero' },
      { kind: 'tone', sectionId: 'about', tone: 'sand' },
      { kind: 'width', sectionId: 'about', width: 'narrow' },
      { kind: 'move', sectionId: 'hero', toPosition: 1, heading: 'Invented headline' },
      { kind: 'field', sectionId: 'hero', text: 'Invented copy' },
      { kind: 'tone', sectionId: 'hero', tone: '#ff00aa' },
      { kind: 'move', sectionId: 'ghost', toPosition: 1 },
      { kind: 'move', sectionId: 'hero', toPosition: 9 },
      { kind: 'width', sectionId: 'hero', width: 'wide', css: 'color:red' },
      { kind: 'delete', sectionId: 'hero' },
    ] }, ids)
    expect(parsed.changes.map((c) => c.kind)).toEqual(['move', 'visibility', 'duplicate', 'tone', 'width'])
    expect(parsed.refused).toHaveLength(7)
    expect(parsed.refused[0]).toContain('does not write or rewrite your words')
    expect(parsed.refused[1]).toContain('does not write or rewrite your words')
    expect(JSON.stringify(parsed)).not.toContain('Invented')
  })

  it('caps a proposal and says so', () => {
    const many = Array.from({ length: MAX_VERA_LAYOUT_CHANGES + 3 }, () => ({ kind: 'duplicate', sectionId: 'hero' }))
    const parsed = parseWebsiteVeraLayout({ changes: many }, ids)
    expect(parsed.changes).toHaveLength(MAX_VERA_LAYOUT_CHANGES)
    expect(parsed.refused[0]).toContain(`first ${MAX_VERA_LAYOUT_CHANGES}`)
    expect(parseWebsiteVeraLayout('not a proposal', ids)).toEqual({ changes: [], refused: [] })
  })

  it('applies ticked changes in order, leaving the owner’s words exactly as written', () => {
    const { doc: next, results } = applyWebsiteVeraLayout(doc, config, [
      { kind: 'move', sectionId: 'about', toPosition: 2 },
      { kind: 'visibility', sectionId: 'contact', device: 'phone', visible: false },
      { kind: 'tone', sectionId: 'about', tone: 'sand' },
      { kind: 'width', sectionId: 'hero', width: 'wide' },
      { kind: 'duplicate', sectionId: 'about' },
    ])
    expect(results.every((r) => r.ok)).toBe(true)
    expect(next.content.map((b) => b.type)).toEqual(['Hero', 'About', 'About', 'Contact'])
    expect(sectionVisibility(next, 'contact')).toEqual({ desktop: true, tablet: true, phone: false })
    expect(sectionDisplay(next, 'about', 'desktop').tone).toBe('sand')
    expect(sectionDisplay(next, 'hero', 'desktop').width).toBe('wide')
    expect(next.content.filter((b) => b.type === 'About').map((b) => b.props.body)).toEqual(['My own story, word for word.', 'My own story, word for word.'])
    expect(next.content[0].props.title).toBe('My own headline')
    expect(doc.content.map((b) => b.props.id)).toEqual(['hero', 'contact', 'about'])
  })

  it('reports a line whose section is gone instead of hiding it', () => {
    const { results } = applyWebsiteVeraLayout(doc, config, [{ kind: 'move', sectionId: 'gone', toPosition: 1 }])
    expect(results[0]).toMatchObject({ ok: false })
    expect(results[0].line).toContain('no longer on the page')
  })

  it('describes each line in plain words', () => {
    expect(describeWebsiteVeraChange({ kind: 'visibility', sectionId: 'contact', device: 'phone', visible: false }, doc, config)).toBe('Hide Contact on phones')
    expect(describeWebsiteVeraChange({ kind: 'move', sectionId: 'about', toPosition: 1 }, doc, config)).toBe('Move About to position 1')
  })
})

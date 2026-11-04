import { describe, expect, it } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import { sectionDisplay, sectionVisibility } from './state'
import { VERA_SECTION_TONES, VERA_SECTION_WIDTHS, MAX_VERA_LAYOUT_CHANGES, applyWebsiteVeraLayout, describeWebsiteVeraChange, parseWebsiteVeraLayout, readWebsiteVeraStyleMenu, websiteVeraGhost, websiteVeraOutline, websiteVeraStylePatch, type WebsiteVeraStyleMenu } from './vera-layout'

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

describe('Vera style changes from the theme menu (LIVE-2098)', () => {
  const menu: WebsiteVeraStyleMenu = {
    dials: [
      { id: 'corners', label: 'Corners', options: [{ id: 'soft', label: 'Soft' }, { id: 'square', label: 'Square' }], current: 'soft', own: 'soft' },
      { id: 'motion', label: 'Motion', options: [{ id: 'calm', label: 'Calm' }, { id: 'lively', label: 'Lively' }], current: 'calm', own: 'calm' },
    ],
    accents: [{ id: 'tide', label: 'Tide' }, { id: 'ember', label: 'Ember' }],
    accent: null,
    looks: [{ id: 'crisp', label: 'Crisp', dials: { corners: 'square' } }],
  }

  it('parses dial, accent and Look picks that are on the menu and refuses everything else', () => {
    const parsed = parseWebsiteVeraLayout({ changes: [
      { kind: 'style', dial: 'corners', option: 'square' },
      { kind: 'accent', accent: 'ember' },
      { kind: 'look', look: 'crisp' },
      { kind: 'style', dial: 'corners', option: 'blobby' },
      { kind: 'style', dial: 'font', option: 'comic' },
      { kind: 'accent', accent: '#ff00aa' },
      { kind: 'look', look: 'neon' },
      { kind: 'style', dial: 'corners', option: 'square', value: 'x' },
      { kind: 'style', dial: 'corners', option: 'square', css: 'color:red' },
    ] }, ids, menu)
    expect(parsed.changes).toEqual([
      { kind: 'style', dial: 'corners', option: 'square' },
      { kind: 'accent', accent: 'ember' },
      { kind: 'look', look: 'crisp' },
    ])
    expect(parsed.refused).toHaveLength(6)
    expect(parsed.refused[4]).toMatch(/does not write or rewrite your words/)
  })

  it('refuses every style line when no menu is open', () => {
    const parsed = parseWebsiteVeraLayout({ changes: [{ kind: 'accent', accent: 'tide' }] }, ids)
    expect(parsed.changes).toEqual([])
    expect(parsed.refused[0]).toMatch(/not open here/)
  })

  it('describes style lines in the theme\'s own labels', () => {
    expect(describeWebsiteVeraChange({ kind: 'style', dial: 'motion', option: 'lively' }, doc, config, menu)).toBe('Set Motion to Lively across your site')
    expect(describeWebsiteVeraChange({ kind: 'accent', accent: 'tide' }, doc, config, menu)).toBe('Use the Tide accent across your site')
    expect(describeWebsiteVeraChange({ kind: 'look', look: 'crisp' }, doc, config, menu)).toBe('Use the Crisp Look across your site')
  })

  it('patches the draft look the way the Style panel does: own values store nothing, a Look resets the dials first', () => {
    expect(websiteVeraStylePatch(menu, [{ kind: 'style', dial: 'motion', option: 'lively' }, { kind: 'style', dial: 'corners', option: 'soft' }]).patch).toEqual({ motion: 'lively', corners: null })
    const look = websiteVeraStylePatch(menu, [{ kind: 'style', dial: 'motion', option: 'lively' }, { kind: 'look', look: 'crisp' }, { kind: 'accent', accent: 'tide' }])
    expect(look.patch).toEqual({ corners: 'square', accent: 'tide' })
    expect(look.drop).toEqual(['motion'])
    const stale = websiteVeraStylePatch({ ...menu, accents: [] }, [{ kind: 'accent', accent: 'tide' }])
    expect(stale.results[0].ok).toBe(false)
    expect(stale.patch).toEqual({})
  })

  it('section changes ignore style lines and style patches ignore section lines', () => {
    const changes = [{ kind: 'accent', accent: 'tide' } as const, { kind: 'move', sectionId: 'about', toPosition: 1 } as const]
    expect(applyWebsiteVeraLayout(doc, config, [...changes]).results.map((r) => r.change.kind)).toEqual(['move'])
    expect(websiteVeraStylePatch(menu, changes).results.map((r) => r.change.kind)).toEqual(['accent'])
  })

  it('reads a menu that crossed the network by shape, and drops Look settings outside the dials', () => {
    const read = readWebsiteVeraStyleMenu({ ...menu, looks: [{ id: 'crisp', label: 'Crisp', dials: { corners: 'square', font: 'comic', motion: 'warp' } }] })
    expect(read?.looks[0].dials).toEqual({ corners: 'square' })
    expect(readWebsiteVeraStyleMenu({ ...menu, dials: [{ id: 'Bad Id', label: 'x', options: [{ id: 'a', label: 'A' }] }] })).toBeNull()
    expect(readWebsiteVeraStyleMenu({ ...menu, dials: [{ id: 'corners', label: 'x', options: [] }] })).toBeNull()
    expect(readWebsiteVeraStyleMenu('nope')).toBeNull()
  })
})

describe('Vera adds a section the Add tab offers (LIVE-2135)', () => {
  const addConfig: Config = { components: { ...config.components, Gallery: { label: 'Gallery', fields: { title: { type: 'text' } }, defaultProps: { title: 'Your gallery title goes here' }, render: () => null } } }
  const addable = [{ type: 'Gallery', label: 'Gallery' }]
  it('parses an add from the addable list and refuses anything else', () => {
    const parsed = parseWebsiteVeraLayout({ changes: [
      { kind: 'add', blockType: 'Gallery', toPosition: 2 },
      { kind: 'add', blockType: 'Shop', toPosition: 1 },
      { kind: 'add', blockType: 'Gallery', toPosition: 9 },
      { kind: 'add', blockType: 'Gallery', toPosition: 1, title: 'My words' },
    ] }, ids, { dials: [], accents: [], accent: null, looks: [], sections: addable })
    expect(parsed.changes).toEqual([{ kind: 'add', blockType: 'Gallery', toPosition: 2 }])
    expect(parsed.refused).toHaveLength(3)
    expect(parsed.refused[2]).toMatch(/does not write/)
  })
  it('refuses an add when no section list is open', () => {
    expect(parseWebsiteVeraLayout({ changes: [{ kind: 'add', blockType: 'Gallery', toPosition: 1 }] }, ids).refused[0]).toMatch(/not open here/)
    expect(parseWebsiteVeraLayout({ changes: [{ kind: 'add', blockType: 'Gallery', toPosition: 1 }] }, ids, { dials: [], accents: [], accent: null, looks: [] }).refused[0]).toMatch(/not open here/)
  })
  it('inserts the block with its own placeholder prompts at the position, and says so', () => {
    const change = { kind: 'add', blockType: 'Gallery', toPosition: 2 } as const
    expect(describeWebsiteVeraChange(change, doc, addConfig)).toBe('Add a Gallery section at position 2, with placeholder text for your words')
    const { doc: next, results } = applyWebsiteVeraLayout(doc, addConfig, [change])
    expect(results[0].ok).toBe(true)
    expect(next.content.map((b) => b.type)).toEqual(['Hero', 'Gallery', 'Contact', 'About'])
    expect(next.content[1].props.title).toBe('Your gallery title goes here')
    expect(next.content[1].props.id).toBeTruthy()
    expect(doc.content).toHaveLength(3)
  })
  it('reads the section list on a menu that crossed the network by shape', () => {
    const menu = { dials: [], accents: [], accent: null, looks: [] }
    expect(readWebsiteVeraStyleMenu({ ...menu, sections: addable })?.sections).toEqual(addable)
    expect(readWebsiteVeraStyleMenu(menu)?.sections).toBeUndefined()
    expect(readWebsiteVeraStyleMenu({ ...menu, sections: [{ type: 'gallery; drop', label: 'x' }] })).toBeNull()
    expect(readWebsiteVeraStyleMenu({ ...menu, sections: 'Gallery' })).toBeNull()
  })
})

describe('Vera previews her proposal on the page before it is applied (LIVE-2141)', () => {
  it('draws only the ticked section lines and leaves the page itself untouched', () => {
    const before = JSON.stringify(doc)
    const ghost = websiteVeraGhost(doc, config, [
      { kind: 'move', sectionId: 'about', toPosition: 2 },
      { kind: 'move', sectionId: 'contact', toPosition: 1 },
      { kind: 'accent', accent: 'tide' },
    ], [true, false, true])
    expect(ghost.doc.content.map((b) => b.props.id)).toEqual(['hero', 'about', 'contact'])
    expect(ghost.changed).toBe(1)
    expect(ghost.styleLines).toBe(1)
    expect(JSON.stringify(doc)).toBe(before)
  })

  it('shows the page as it is when nothing is ticked', () => {
    const ghost = websiteVeraGhost(doc, config, [{ kind: 'move', sectionId: 'about', toPosition: 1 }], [false])
    expect(ghost.doc.content.map((b) => b.props.id)).toEqual(['hero', 'contact', 'about'])
    expect(ghost.changed).toBe(0)
  })
})

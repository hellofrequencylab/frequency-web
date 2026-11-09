import { describe, expect, it } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import { acceptGroup, applyEdits, readPage, validateProposal, veraGhost, veraGroups, veraMaySpeak, veraMenu, veraOpening } from './vera'

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
const menu = veraMenu(doc, config, [{ type: 'About', label: 'About' }])
const reply = { note: 'Story first, contact last.', changes: [
  { kind: 'move', sectionId: 'about', toPosition: 1 },
  { kind: 'tone', sectionId: 'about', tone: 'sand' },
  { kind: 'visibility', sectionId: 'contact', device: 'phone', visible: false },
  { kind: 'tone', sectionId: 'hero', tone: '#ff00aa' },
  { kind: 'width', sectionId: 'hero', width: 'wide', css: 'color:red' },
  { kind: 'field', sectionId: 'hero', text: 'Invented copy' },
  { kind: 'move', sectionId: 'not-here', toPosition: 1 },
  { kind: 'style', dial: 'surface', option: 'glass' },
] }

describe('Vera in the builder (BLD-402)', () => {
  it('speaks first only at page creation, and after that only when asked', () => {
    expect(veraMaySpeak('page-created')).toBe(true)
    expect(veraMaySpeak('command')).toBe(true)
    expect(veraMaySpeak('rail')).toBe(true)
    for (const quiet of ['idle', 'edit', 'save'] as const) expect(veraMaySpeak(quiet)).toBe(false)
    expect(veraOpening({ root: {}, content: [] })).toContain('Tell me what it is for')
    expect(veraOpening(doc)).toBeNull()
  })

  it('reads the page as an outline: kinds, positions and a short summary, never the full text', () => {
    const outline = readPage(doc, config)
    expect(outline.map((s) => s.id)).toEqual(['hero', 'contact', 'about'])
    expect(outline.every((o) => o.summary.length <= 200)).toBe(true)
    expect(outline[2]).toMatchObject({ type: 'About', position: 3 })
  })

  it('names only tokens and known slot keys: anything with words, a colour, css or an unknown section is refused', () => {
    const proposal = validateProposal(reply, doc, 'home', menu)
    expect(proposal.changes.map((c) => c.kind)).toEqual(['move', 'tone', 'visibility'])
    expect(proposal.refused).toHaveLength(5)
    expect(JSON.stringify(proposal)).not.toMatch(/Invented|#ff00aa|color:red/)
  })

  it('groups lines by section, and accepting a group is one document with only that group applied', () => {
    const proposal = validateProposal(reply, doc, 'home', menu)
    const groups = veraGroups(proposal, doc, config, menu)
    expect(groups.map((g) => [g.id, g.lines.length])).toEqual([['contact', 1], ['about', 2]])
    const about = groups.find((g) => g.id === 'about')!
    const accepted = acceptGroup(proposal, about, doc, config)
    expect(accepted.applied).toBe(2)
    expect(accepted.doc.content.map((b) => b.props.id)).toEqual(['about', 'hero', 'contact'])
    expect(accepted.rest.changes.map((c) => c.kind)).toEqual(['visibility'])
    // The owner's words are exactly as written.
    expect(accepted.doc.content.find((b) => b.props.id === 'about')?.props.body).toBe('My own story, word for word.')
    // The proposal is untouched until accepted.
    expect(doc.content.map((b) => b.props.id)).toEqual(['hero', 'contact', 'about'])
  })

  it('draws a ghost for one group or all of them without touching the draft', () => {
    const proposal = validateProposal(reply, doc, 'home', menu)
    const groups = veraGroups(proposal, doc, config, menu)
    const one = veraGhost(proposal, groups[1], doc, config)
    expect(one.changed).toBe(2)
    expect(one.doc.content[0].props.id).toBe('about')
    expect(veraGhost(proposal, 'all', doc, config).changed).toBe(3)
    expect(doc.content[0].props.id).toBe('hero')
  })

  it('reports a line the page could not take instead of hiding it', () => {
    const result = applyEdits(doc, config, [{ kind: 'move', sectionId: 'gone', toPosition: 1 }])
    expect(result.applied).toBe(0)
    expect(result.missed[0]).toContain('no longer on the page')
  })
})

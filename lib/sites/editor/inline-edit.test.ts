import { describe, expect, it } from 'vitest'
import { findInlineTextMatch, replaceInlineTextSegment, replaceInlineField, inlineFieldValue } from './inline-edit'

const fields = { body: { type: 'textarea' } }
describe('inline website paragraph edits', () => {
  it('edits a paragraph while preserving every other paragraph and its separators', () => {
    const body = 'First paragraph.\n\nA **bold** second paragraph.\n\nLast paragraph.'
    const match = findInlineTextMatch({ body }, fields, 'A bold second paragraph.')!
    expect(replaceInlineTextSegment(body, match, 'A changed second paragraph.')).toBe('First paragraph.\n\nA changed second paragraph.\n\nLast paragraph.')
  })
  it('targets the clicked occurrence when identical paragraphs repeat', () => {
    const body = 'Same paragraph.\n\nMiddle paragraph.\n\nSame paragraph.'
    const match = findInlineTextMatch({ body }, fields, 'Same paragraph.', 1)!
    expect(replaceInlineTextSegment(body, match, 'Changed last paragraph.')).toBe('Same paragraph.\n\nMiddle paragraph.\n\nChanged last paragraph.')
    expect(findInlineTextMatch({ body }, fields, 'Same paragraph.', 2)).toBeNull()
  })
  it('preserves structural rich HTML while replacing only one paragraph', () => {
    const body = '<p>First <strong>paragraph</strong>.</p><p>Second paragraph.</p>'
    const match = findInlineTextMatch({ body }, fields, 'Second paragraph.')!
    expect(replaceInlineTextSegment(body, match, '<em>Changed</em> paragraph.')).toBe('<p>First <strong>paragraph</strong>.</p><p><em>Changed</em> paragraph.</p>')
  })
})

 it('edits one repeated authored card label without changing its siblings or navigation', () => {
   const props = { items: [{ title: 'Same', href: '/first', body: 'First' }, { title: 'Same', href: '/second', body: 'Second' }] }
   const original = structuredClone(props)
   const schema = { items: { type: 'array', arrayFields: { title: { type: 'text' }, body: { type: 'textarea' } } } }
   const match = findInlineTextMatch(props, schema, 'Same', 1)!
   expect(inlineFieldValue(props, match)).toBe('Same')
   expect(replaceInlineField(props, match, 'Changed')).toEqual([{ title: 'Same', href: '/first', body: 'First' }, { title: 'Changed', href: '/second', body: 'Second' }])
   expect(props).toEqual(original)
 })
 it('edits nested authored objects and ignores explicitly read-only fields', () => {
   const props = { card: { caption: { text: 'Actual caption', source: 'Original photo' } }, liveLabel: 'Actual caption' }
   const schema = { liveLabel: { type: 'text', contentEditable: false }, card: { type: 'object', objectFields: { caption: { type: 'object', objectFields: { text: { type: 'textarea' } } } } } }
   const match = findInlineTextMatch(props, schema, 'Actual caption')!
   expect(replaceInlineField(props, match, 'Edited caption')).toEqual({ caption: { text: 'Edited caption', source: 'Original photo' } })
 })

 it('distinguishes repeated card headings from identical body copy', () => {
   const props = { items: [{ title: 'Same', body: 'Same' }, { title: 'Same', body: 'Same' }] }
   const schema = { items: { type: 'array', arrayFields: { title: { type: 'text' }, body: { type: 'textarea' } } } }
   const heading = findInlineTextMatch(props, schema, 'Same', 1, 'heading')!
   const paragraph = findInlineTextMatch(props, schema, 'Same', 1, 'body')!
   expect(replaceInlineField(props, heading, 'Second title')).toEqual([{ title: 'Same', body: 'Same' }, { title: 'Second title', body: 'Same' }])
   expect(replaceInlineField(props, paragraph, 'Second body')).toEqual([{ title: 'Same', body: 'Same' }, { title: 'Same', body: 'Second body' }])
 })
 it('refuses ambiguous same-role text instead of changing a different field', () => {
   expect(findInlineTextMatch({ heading: 'Same', title: 'Same' }, { heading: { type: 'text' }, title: { type: 'text' } }, 'Same', 0, 'heading')).toBeNull()
   expect(findInlineTextMatch({ label: 'Same', ctaLabel: 'Same' }, { label: { type: 'text' }, ctaLabel: { type: 'text' } }, 'Same', 0, 'label')).toBeNull()
   expect(findInlineTextMatch({ cards: [{ title: 'Same' }], offers: [{ title: 'Same' }] }, { cards: { type: 'array', arrayFields: { title: { type: 'text' } } }, offers: { type: 'array', arrayFields: { title: { type: 'text' } } } }, 'Same', 0, 'heading')).toBeNull()
 })

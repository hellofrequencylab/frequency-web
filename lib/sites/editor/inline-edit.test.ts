import { describe, expect, it } from 'vitest'
import { findInlineTextMatch, replaceInlineTextSegment } from './inline-edit'

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

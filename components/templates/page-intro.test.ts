import { describe, it, expect } from 'vitest'
import { splitIntroParagraphs } from './page-intro'

// The one seam between what an operator types and what a page shows (ADR-1284). Each case is a
// consequence a reader would see, not the function's shape.
describe('splitIntroParagraphs — the intro copy seam', () => {
  it('nothing renders nothing: null, undefined and whitespace are zero paragraphs', () => {
    expect(splitIntroParagraphs(null)).toEqual([])
    expect(splitIntroParagraphs(undefined)).toEqual([])
    expect(splitIntroParagraphs('   \n\n  ')).toEqual([])
  })

  it('a blank line splits paragraphs, however much whitespace it carries', () => {
    expect(splitIntroParagraphs('One.\n\nTwo.')).toEqual(['One.', 'Two.'])
    expect(splitIntroParagraphs('One.\n   \n\n\nTwo.')).toEqual(['One.', 'Two.'])
  })

  it('a soft wrap inside a paragraph is a space, never a break', () => {
    expect(splitIntroParagraphs('First line\nsecond line')).toEqual(['First line second line'])
  })

  it('leading and trailing blank lines do not become empty paragraphs', () => {
    expect(splitIntroParagraphs('\n\nOnly.\n\n')).toEqual(['Only.'])
  })

  it('CRLF from a Windows paste splits the same as LF', () => {
    expect(splitIntroParagraphs('One.\r\n\r\nTwo.')).toEqual(['One.', 'Two.'])
  })
})

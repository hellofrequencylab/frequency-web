import { describe, expect, it } from 'vitest'
import { helpHeadingSlug, helpToc } from './toc'

describe('helpHeadingSlug', () => {
  it('slugs a heading the way HelpMarkdown ids it (SCAN-805)', () => {
    expect(helpHeadingSlug('What if I miss a week?')).toBe('what-if-i-miss-a-week')
    expect(helpHeadingSlug('  ?! ')).toBeUndefined()
  })
})

describe('helpToc', () => {
  it('lists the lines rendered as h2 (# and ##), with their inline markdown read as text', () => {
    const body = [
      '# Start here',
      'Intro.',
      '## Find a **Circle** near you',
      '### Not a section',
      '## Use the [map](/discover) ##',
      '```md',
      '## Not a heading either',
      '```',
      '## `Code` names',
    ].join('\n')
    expect(helpToc(body)).toEqual([
      { id: 'start-here', title: 'Start here' },
      { id: 'find-a-circle-near-you', title: 'Find a Circle near you' },
      { id: 'use-the-map', title: 'Use the map' },
      { id: 'code-names', title: 'Code names' },
    ])
  })

  it('is empty for a body with no sections', () => {
    expect(helpToc('Just a paragraph.')).toEqual([])
  })
})

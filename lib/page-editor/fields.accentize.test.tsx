import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { accentize } from './fields'

describe('accentize punctuation', () => {
  it('collapses a space before a comma after the accent word', () => {
    const html = renderToStaticMarkup(<>{accentize('Four nouns , and that is it.', 'nouns')}</>)
    expect(html).toContain('>, and that is it.')
    expect(html).not.toContain('> ,')
  })

  it('collapses a space before a period after the accent word', () => {
    const html = renderToStaticMarkup(<>{accentize('You help build .', 'build')}</>)
    expect(html).toContain('</span>.')
    expect(html).not.toContain('> .')
  })
})

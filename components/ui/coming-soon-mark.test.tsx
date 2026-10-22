import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ComingSoonMark } from './coming-soon-mark'

describe('ComingSoonMark', () => {
  it('says Coming soon and explains itself', () => {
    const html = renderToStaticMarkup(<ComingSoonMark />)
    expect(html).toContain('Coming soon')
    expect(html).toContain('Not built yet')
  })
})

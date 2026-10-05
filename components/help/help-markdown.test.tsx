import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HelpMarkdown } from './help-markdown'

// Four published help articles carry a pipe table (SCAN-658). Without GFM, react-markdown renders
// the pipes as paragraph text, which is what readers saw until 2026-10-05.
describe('HelpMarkdown', () => {
  it('renders a GFM pipe table as a table, not as paragraph text', () => {
    const html = renderToStaticMarkup(
      <HelpMarkdown>{'| Plan | Fee |\n| --- | --- |\n| Free | 0% |\n'}</HelpMarkdown>,
    )
    expect(html).toContain('<table')
    expect(html).toContain('<th')
    expect(html).toContain('Free')
    expect(html).not.toContain('| --- |')
  })

  it('still routes an internal link through next/link', () => {
    const html = renderToStaticMarkup(<HelpMarkdown>{'[Circles](/help/circles)'}</HelpMarkdown>)
    expect(html).toContain('href="/help/circles"')
  })
})

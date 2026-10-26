import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SlotsPanel } from './slots-panel'

describe('SlotsPanel', () => {
  it('shows saved words, a nudge for sample words, and links to the form that owns each fact', () => {
    const html = renderToStaticMarkup(<SlotsPanel origin="https://app.example" groups={[{ label: 'About you', rows: [
      { key: 'tagline', label: 'Tagline', saved: 'Slow down', uses: 2, href: '/spaces/salt/manage' },
      { key: 'story', label: 'Story', saved: null, uses: 1, href: '/spaces/salt/manage' },
      { key: 'intro', label: 'Short intro', saved: null, uses: 0, href: '/spaces/salt/manage' },
    ] }]} />)
    expect(html).toContain('Slow down')
    expect(html).toContain('2 on this page')
    expect(html).toContain('Sample words showing. Add yours.')
    expect(html).toContain('Not filled in yet')
    expect(html).toContain('href="https://app.example/spaces/salt/manage"')
  })
})

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FqMegaFooter } from './mega-footer'
import { LEGAL_LINKS } from '@/lib/nav/legal-links'
import { siteNavigationSchema } from '@/lib/jsonld'
import { visibleFooterColumns } from '@/lib/nav/footer-access'

const render = () =>
  renderToStaticMarkup(
    <FqMegaFooter
      columns={[{ title: 'Explore', links: [{ label: 'Circles', href: '/circles' }] }]}
      ctas={[{ label: 'Start a Circle', href: '/circles/new', primary: true }]}
      tagline="Local groups that keep meeting."
      quick={[{ label: 'Help', href: '/help' }]}
    />,
  )

describe('the mega footer (LIVE-1030)', () => {
  it('draws the index in the HTML while closed, so a crawler reads it', () => {
    const html = render()
    expect(html).toContain('<details')
    expect(html).not.toContain('<details open')
    expect(html).toContain('aria-label="Site index"')
    expect(html).toContain('href="/circles"')
    expect(html).toContain('Start a Circle')
  })

  it('keeps every legal link and the contact outside the closing panel', () => {
    const html = render()
    const afterPanel = html.slice(html.indexOf('</details>'))
    for (const l of LEGAL_LINKS) expect(afterPanel).toContain(`href="${l.href}"`)
    expect(afterPanel).toContain('mailto:')
  })

  it('writes the index as SiteNavigationElement JSON-LD in the footer itself (LIVE-1095)', () => {
    const html = render()
    expect(html).toContain('application/ld+json')
    expect(html).toContain('SiteNavigationElement')
  })

  it('shows a visitor no member-only column, and a member the Quest', () => {
    const visitor = visibleFooterColumns(null).flatMap((c) => c.links.map((l) => l.href))
    expect(visitor).not.toContain('/crew/leaderboard')
    const member = visibleFooterColumns('member').flatMap((c) => c.links.map((l) => l.href))
    expect(member).toContain('/crew/leaderboard')
  })

  it('writes one SiteNavigationElement per distinct page, never a mailto or a repeat', () => {
    const g = siteNavigationSchema([
      { title: 'A', links: [{ label: 'One', href: '/one' }, { label: 'Dup', href: '/one' }, { label: 'Mail', href: 'mailto:x@y.z' }] },
      { title: 'B', links: [{ label: 'Two', href: '/two' }] },
    ])['@graph'] as { name: string }[]
    expect(g.map((n) => n.name)).toEqual(['One', 'Two'])
  })
})

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FqMegaFooter } from './mega-footer'
import { LEGAL_LINKS } from '@/lib/nav/legal-links'
import { siteNavigationSchema } from '@/lib/jsonld'
import { visibleFooterColumns } from '@/lib/nav/footer-access'

const render = (extra: { title: string; links: { label: string; href: string }[] }[] = []) =>
  renderToStaticMarkup(
    <FqMegaFooter
      columns={[{ title: 'Explore', links: [{ label: 'Circles', href: '/circles' }] }, ...extra]}
      ctas={[{ label: 'Start a Circle', href: '/circles/new', primary: true }]}
      tagline="Local groups that keep meeting."
      quick={[{ label: 'Settings', href: '/settings' }]}
    />,
  )

describe('the mega footer (LIVE-1030, LIVE-1115)', () => {
  it('draws the index in the HTML while closed, so a crawler reads it', () => {
    const html = render()
    expect(html).not.toContain('<details')
    expect(html).toContain('aria-label="Site index"')
    expect(html).toContain('href="/circles"')
    expect(html).toContain('Start a Circle')
  })

  it('opens the index as a native pop-up dialog on the stage surface, from one trigger', () => {
    const html = render()
    expect(html).toContain('popover="auto"')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('data-surface="stage"')
    expect(html.match(/popovertarget="fq-mf-pop"/gi)).toHaveLength(2)
    expect(html).toMatch(/popovertargetaction="hide"/i)
  })

  it('keeps the closed bar quiet: one trigger, no loose links', () => {
    const html = render()
    const bar = html.slice(html.indexOf('fq-mf-bar'), html.indexOf('id="fq-mf-pop"'))
    expect(bar.match(/<button/g)).toHaveLength(1)
    expect(bar).not.toContain('<a ')
  })

  it('keeps the Legal column in the index grid, from the shared list, and the contact in the last row', () => {
    const html = render([{ title: 'Legal', links: LEGAL_LINKS.map((l) => ({ label: l.label, href: l.href })) }])
    expect(html).toContain('>Legal</h3>')
    for (const l of LEGAL_LINKS) expect(html.match(new RegExp(`href="${l.href}"`, 'g'))).toHaveLength(1)
    expect(html).toContain('mailto:')
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

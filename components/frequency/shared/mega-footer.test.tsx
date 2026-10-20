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
    />,
  )

describe('the mega footer (LIVE-1030, LIVE-1154)', () => {
  it('draws every panel in the HTML while closed, so a crawler reads the whole index', () => {
    const html = render([{ title: 'The Quest', links: [{ label: 'Journeys', href: '/journeys' }] }])
    expect(html).toContain('href="/circles"')
    expect(html).toContain('href="/journeys"')
    expect(html).toContain('Start a Circle')
    expect(html.match(/class="fq-mf-mega"[^>]*hidden=""/g)).toHaveLength(2)
  })

  it('is a footer band on the stage surface whose area headings are the tabs; no lone index button', () => {
    const html = render([{ title: 'Support', links: [{ label: 'Help', href: '/help' }] }])
    expect(html).toContain('data-surface="stage"')
    const tabs = html.slice(html.indexOf('class="fq-mf-tabs"'), html.indexOf('class="fq-mf-wrap fq-mf-bot"'))
    expect(tabs.match(/<button/g)).toHaveLength(2)
    expect(tabs).toContain('aria-controls="fq-mf-p0"')
    expect(tabs).toContain('aria-controls="fq-mf-p1"')
    expect(tabs).toContain('aria-expanded="false"')
    expect(html).not.toContain('popover')
  })

  it('keeps the legal row and the contact in the footer itself, and the Legal tab from the shared list', () => {
    const html = render([{ title: 'Legal', links: LEGAL_LINKS.map((l) => ({ label: l.label, href: l.href })) }])
    const bot = html.slice(html.indexOf('class="fq-mf-wrap fq-mf-bot"'))
    for (const l of LEGAL_LINKS) expect(bot).toContain(`href="${l.href}"`)
    expect(bot).toContain('mailto:')
    expect(html).toContain('>Legal<')
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

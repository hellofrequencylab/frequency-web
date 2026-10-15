// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import Link from 'next/link'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('next/navigation', () => ({ usePathname: () => '/practices' }))
vi.mock('@/components/layout/page-admin-bar', () => ({ PageAdminBar: () => <div data-testid="settings">Settings</div> }))
import { IndexTemplate } from './index-template'
import { MarketHero } from '@/components/marketplace/market-hero'
import { PageHero } from './page-hero'
import { DirHero } from '@/components/frequency/site/pages/discover/dir-parts'
import { DxHero } from '@/components/frequency/site/pages/discover/parts'
function dom(markup: string) { const host = document.createElement('div'); host.innerHTML = markup; return host }
describe('one Frequency index header contract', () => {
  it('replaces an index photo band without losing actions, navigation, filters, admin or content', () => {
    const h = dom(renderToStaticMarkup(<IndexTemplate title="Practices" description="Find one for today." heroOverlay heroImage="/old-photo.jpg" trail={[{ href:'/feed',label:'Home' }]} back={{href:'/network',label:'Network'}} action={<Link href="/practices/new">New practice</Link>} underHero={<Link href="/drafts">Drafts</Link>} toolbar={<form action="/practices"><input name="q" defaultValue="walk"/><input type="hidden" name="sort" value="new"/></form>} banner={<aside>Staff preview</aside>} intro="About this library."><div>Real library</div></IndexTemplate>))
    expect(h.querySelector('.fq-index-header h1')?.textContent).toBe('Practices')
    expect(h.querySelectorAll('h1')).toHaveLength(1)
    expect(h.querySelector('img')).toBeNull()
    expect(h.querySelector('a[href="/practices/new"]')).not.toBeNull()
    expect(h.querySelector('a[href="/network"]')).not.toBeNull()
    expect(h.querySelector('a[href="/drafts"]')).not.toBeNull()
    expect(h.querySelector('.fq-index-toolbar form input[name="q"]')?.getAttribute('value')).toBe('walk')
    expect(h.querySelector('input[name="sort"]')?.getAttribute('value')).toBe('new')
    expect(h.textContent).toContain('Staff preview')
    expect(h.textContent).toContain('Settings')
    expect(h.textContent).toContain('Real library')
    expect(h.textContent).toContain('About this library.')
  })
  it('MarketHero uses that same compact header and preserves its live search slot', () => {
    const h = dom(renderToStaticMarkup(<MarketHero image="/old-cover.jpg" title="Spaces" subtitle="Find a place." search={<form role="search"><input aria-label="Search spaces"/></form>} action={<Link href="/spaces/new">Create a Space</Link>}/>))
    expect(h.querySelector('.fq-index-header h1')?.textContent).toBe('Spaces')
    expect(h.querySelector('img')).toBeNull()
    expect(h.querySelector('[role="search"]')).not.toBeNull()
    expect(h.querySelector('a[href="/spaces/new"]')).not.toBeNull()
  })
  it('public collection adapters share the contract while their actual entity defaults retain covers', () => {
    for (const markup of [renderToStaticMarkup(<DirHero compact title="Practices" image="/practice.jpg" crumbs={[{href:'/discover',label:'Discover'},{label:'Practices'}]} lede="Browse practices."/>),renderToStaticMarkup(<DxHero compact title="Events" photo="/events.jpg" crumbs={[{label:'Events'}]} lede="Find a gathering."/>)]) {
      const h=dom(markup)
      expect(h.querySelector('.fq-index-header h1')).not.toBeNull()
      expect(h.querySelector('.phero')).toBeNull()
      expect(h.querySelector('[style*="background-image"]')).toBeNull()
    }
    const entity=dom(renderToStaticMarkup(<DirHero title="One practice" image="/detail.jpg" crumbs={[{label:'One practice'}]}/>))
    expect(entity.querySelector('.phero')).not.toBeNull()
    expect(entity.querySelector('.fq-index-header')).toBeNull()
  })
  it('keeps the richer entity PageHero independent', () => {
    const h = dom(renderToStaticMarkup(<PageHero coverImage="/entity.jpg" title="One actual entity" rawImg/>))
    expect(h.querySelector('img')?.getAttribute('src')).toBe('/entity.jpg')
    expect(h.querySelector('.fq-index-header')).toBeNull()
  })
})

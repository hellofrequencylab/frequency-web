// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'dawn' }))
vi.mock('next/navigation', () => ({ usePathname: () => '/store' }))
vi.mock('@/components/layout/page-admin-bar', () => ({ PageAdminBar: () => null }))
import { MarketHero } from '@/components/marketplace/market-hero'
import { IndexTemplate } from './index-template'
it('Dawn keeps its existing index/commerce photo-band contract', () => {
  for (const markup of [renderToStaticMarkup(<MarketHero image="/cover.jpg" title="Store"/>),renderToStaticMarkup(<IndexTemplate title="Library" heroImage="/cover.jpg" heroOverlay adminBar={false}><div>Library</div></IndexTemplate>)]) {
    const host=document.createElement('div');host.innerHTML=markup
    expect(host.querySelector('img')).not.toBeNull()
    expect(host.querySelector('.fq-index-header')).toBeNull()
    expect(host.querySelectorAll('h1')).toHaveLength(1)
  }
})

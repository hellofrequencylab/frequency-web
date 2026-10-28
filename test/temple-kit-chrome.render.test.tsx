import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiteChrome } from '@/components/sites/site-chrome'
import { TEMPLE_KIT_CHROME_CSS } from '@/components/sites/temple-kit-chrome-css'
import { TEMPLE_KIT_CSS } from '@/components/sites/temple-kit-css'
import { templeKitAnnounce, templeKitFooterColumns, templeKitLetterParts, templeKitShopHref } from '@/lib/sites/temple-kit-chrome'

vi.mock('@/components/sites/site-admin-gate', () => ({ useSiteAdmin: () => true, SiteAdminOnly: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/app/(main)/spaces/[slug]/contact-form-actions', () => ({ submitContactForm: async () => ({ ok: true }) }))

const links = ['Ceremonies & hire', 'Book', 'Gatherings', 'Programs', 'Shop', 'Membership', 'Library'].map((label, i) => ({ href: `/p${i}`, label, current: label === 'Book' }))

function html() {
  return renderToStaticMarkup(
    <SiteChrome brandName="Temple" homeHref="/" links={links} cta={{ href: '/book', label: 'Book a session', external: false }} themeFonts skin={{ theme: 'temple-kit', season: 'fall' }} tagline="Gatherings" showBrandFooter seasonNow={{ module: 'Solstice', theme: null, next: '2026-12-21T17:00:00Z' }} spaceSlug="temple">
      <p>body</p>
    </SiteChrome>,
  )
}

describe('the Temple Kit site chrome', () => {
  it('draws the announce bar, the lockup, the tools, the letter and the credit inside the sticky top block', () => {
    const h = html()
    for (const c of ['tk-top', 'tk-bar', 'tk-mark', 'tk-logo-tag', 'tk-tools', 'tk-footer-ground', 'tk-letter-title', 'hs-cta-short', 'aria-current="page"', 'Runs on Frequency', 'A letter each season.', 'Four a year.']) expect(h, c).toContain(c)
    expect(h).not.toMatch(/—/)
    expect(h).not.toContain('data-partner-badge')
  })
  it('keeps every rule under the kit root and uses no raw colour', () => {
    for (const sel of TEMPLE_KIT_CHROME_CSS.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) for (const part of sel[1].split(',')) expect(part.trim().startsWith('[data-house-theme="temple-kit"]'), part).toBe(true)
    expect(TEMPLE_KIT_CHROME_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    expect(TEMPLE_KIT_CSS).toContain(TEMPLE_KIT_CHROME_CSS)
    expect(TEMPLE_KIT_CHROME_CSS).toContain('height:36px')
    expect(TEMPLE_KIT_CHROME_CSS).toContain('width:440px')
    expect(TEMPLE_KIT_CHROME_CSS).toContain('width:290px')
  })
  it('reads the Space for the announce line, shop door, footer columns and letter title', () => {
    expect(templeKitAnnounce({ left: 'Open house', items: [] }, null)).toBe('Open house')
    expect(templeKitAnnounce(null, { title: 'Supper', startsAt: '2026-12-21T17:00:00Z' })).toBe('Supper · Mon Dec 21')
    expect(templeKitAnnounce(null, null)).toBeNull()
    expect(templeKitShopHref(links)).toBe('/p4')
    expect(templeKitFooterColumns(links, null).map((c) => c.title)).toEqual(['Work with us', 'Learn'])
    expect(templeKitLetterParts('One. *Two.*')).toEqual([{ text: 'One. ', em: false }, { text: 'Two.', em: true }])
  })
})

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CyberWitchKitSpotlightLayout } from '@/components/spotlight/cyberwitch-kit-layouts'
import { cyberwitchSpacePage } from './cyberwitch-space-page'

const space = (theme: string, accent: string | null) => ({
  slug: 'table-nine', name: 'Table Nine', brandName: null, brandAccent: accent, brandLogoUrl: null,
  preferences: { siteStyle: { theme } },
}) as unknown as Parameters<typeof cyberwitchSpacePage>[0]

describe('a CyberWitch Space Spotlight', () => {
  it('wears the Stack layout in the Space neon, with the kit doors opening this Space pages', () => {
    const c = cyberwitchSpacePage(space('cyberwitch', '#B4FF1A'), 'Readings by candlelight.', {})!
    expect(c.accent).toBe('absinthe')
    expect(c.pain).toBe('Readings by candlelight.')
    expect(c.cta.href).toBe('/spaces/table-nine/book')
    expect(c.doors.every((d) => d.href.startsWith('/spaces/table-nine'))).toBe(true)
    const html = renderToStaticMarkup(<CyberWitchKitSpotlightLayout layout="cyberwitch-kit:stack" content={c} />)
    expect(html).toContain('data-accent="absinthe"')
    expect(html).toContain('Table Nine')
    expect(html).not.toContain('Set your price')
    expect(html).not.toContain('The one sentence a stranger should remember')
  })
  it('makes the owner links the doors and their button the call', () => {
    const c = cyberwitchSpacePage(space('cyberwitch', null), null, {
      links: { items: [{ label: 'Instagram', url: 'https://instagram.com/tablenine' }] },
      button: { label: 'Book a reading', url: 'https://tablenine.example/book' },
    }, 'https://frequencylocal.com')!
    expect(c.doors.map((d) => d.href)).toEqual(['https://instagram.com/tablenine'])
    expect(c.cta).toEqual({ label: 'Book a reading', href: 'https://tablenine.example/book' })
  })
  it('leaves every other theme to the block page', () => {
    expect(cyberwitchSpacePage(space('services', null), null, {})).toBeNull()
  })
})

describe('the kit doors on a Space', () => {
  it('keeps one door per Space page and none that lead nowhere', () => {
    const c = cyberwitchSpacePage(space('cyberwitch', null), null, {})!
    const hrefs = c.doors.map((d) => d.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs).not.toContain('/spaces/table-nine')
    expect(c.doors.map((d) => d.title)).not.toContain('Meet Your')
  })
})

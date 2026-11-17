import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MindlessKitSpotlightLayout } from '@/components/spotlight/mindless-kit-layouts'
import { mindlessSpacePage } from './mindless-space-page'

const space = (theme: string, accent: string | null) => ({
  slug: 'table-nine', name: 'Table Nine', brandName: null, brandAccent: accent, brandLogoUrl: null,
  preferences: { siteStyle: { theme } },
}) as unknown as Parameters<typeof mindlessSpacePage>[0]

describe('a Mindless Space Spotlight', () => {
  it('wears the Stack layout in the Space paint, with the kit doors opening this Space pages', () => {
    const c = mindlessSpacePage(space('mindless', '#E6297D'), 'Sit with us on Thursdays.', {})!
    expect(c.accent).toBe('pink')
    expect(c.pain).toBe('Sit with us on Thursdays.')
    expect(c.cta.href).toBe('/spaces/table-nine/book')
    expect(c.doors.every((d) => d.href.startsWith('/spaces/table-nine'))).toBe(true)
    const html = renderToStaticMarkup(<MindlessKitSpotlightLayout layout="mindless-kit:stack" content={c} />)
    expect(html).toContain('data-accent="pink"')
    expect(html).toContain('Table Nine')
    expect(html).not.toContain('Set your price')
    expect(html).not.toContain('Stillness you find inside the noise')
  })
  it('makes the owner links the doors and their button the call', () => {
    const c = mindlessSpacePage(space('mindless', null), null, {
      links: { items: [{ label: 'Instagram', url: 'https://instagram.com/tablenine' }] },
      button: { label: 'Save a spot', url: 'https://tablenine.example/book' },
    }, 'https://frequencylocal.com')!
    expect(c.doors.map((d) => d.href)).toEqual(['https://instagram.com/tablenine'])
    expect(c.cta).toEqual({ label: 'Save a spot', href: 'https://tablenine.example/book' })
  })
  it('leaves every other theme to the block page', () => {
    expect(mindlessSpacePage(space('services', null), null, {})).toBeNull()
  })
})

describe('the kit doors on a Space', () => {
  it('keeps one door per Space page and none that lead nowhere', () => {
    const c = mindlessSpacePage(space('mindless', null), null, {})!
    const hrefs = c.doors.map((d) => d.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs).not.toContain('/spaces/table-nine')
    expect(c.doors.map((d) => d.title)).not.toContain('Meet Your')
  })
})

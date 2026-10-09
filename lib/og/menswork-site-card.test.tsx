import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MensworkSiteCard } from './menswork-site-card'

// LIVE-870 (owner ask 2026-10-08: "a really well designed social share card with the logo on it").

const card = (headline: string | null) =>
  renderToStaticMarkup(
    <MensworkSiteCard brandName="Heart on Fire" headline={headline} domain="theheartonfire.com" season="fall" logo="data:image/png;base64,AA" cover={null} />,
  )

describe('the Menswork website share card', () => {
  it('carries the logo, the name, the headline with its accent word apart, and the domain', () => {
    const html = card('A year of men’s work, one *circle* at a time.')
    expect(html).toContain('src="data:image/png;base64,AA"')
    expect(html).toContain('Heart on Fire')
    expect(html).toContain('theheartonfire.com')
    expect(html).toContain('>circle</span>')
    expect(html).not.toContain('*')
  })

  it('stands alone: no Frequency mark or name', () => {
    expect(card(null)).not.toMatch(/frequency/i)
  })

  it.each(['public/fonts/SofiaSansExtraCondensed-ExtraBold.ttf', 'public/fonts/Barlow-Medium.ttf'])(
    '%s is a full TrueType face, which Satori can read',
    (path) => {
      const face = readFileSync(path)
      expect(face.length).toBeGreaterThan(50_000)
      expect(face.subarray(0, 4).toString('hex')).toBe('00010000')
    },
  )
})


const routeMocks = vi.hoisted(() => ({ preferences: {} as Record<string, unknown>, image: vi.fn() }))
vi.mock('@/lib/sites/hosted', () => ({ resolveHostedSpace: async () => ({ preferences: routeMocks.preferences, brandLogoUrl: 'https://images.example/original.png', brandAccent: null, coverImageUrl: null, name: 'Heart on Fire' }) }))
vi.mock('@/lib/spaces/website', () => ({ readWebsitePublished: (prefs: Record<string, unknown>) => prefs.websitePublished === true, readSiteHero: () => ({ heading: 'Original heading' }) }))
vi.mock('@/lib/theme/space-themes', () => ({ parseSpaceTheme: () => 'bold' }))
vi.mock('@/lib/og/remote-image', () => ({ fetchRemoteImage: routeMocks.image }))
vi.mock('@/lib/og/load-menswork-fonts', () => ({ loadMensworkFonts: async () => ({ display: new ArrayBuffer(0), body: new ArrayBuffer(0) }) }))
vi.mock('@/lib/og/deliver', () => ({ cardResponse: (element: ReactElement) => new Response(renderToStaticMarkup(element)) }))
import { GET } from '@/app/hosted/[host]/opengraph-image/route'
const published = { theme: 'Menswork', chrome: { name: 'Published website name' }, brand: { logo: 'https://images.example/published.png' }, pages: [{ slug: 'home', label: 'Home', doc: { root: {}, content: [] }, seo: { title: '', description: '' }, comments: [] }] }
it('serves the published Menswork theme and logo independently from Space and private draft branding', async () => {
  routeMocks.image.mockReset().mockResolvedValue(null)
  routeMocks.preferences = { websitePublished: true, websiteEditor: { published, draft: { ...published, chrome: { name: 'Private draft name' }, brand: { logo: 'https://images.example/private.png' } } } }
  const response = await GET(new Request('https://site.example/opengraph-image'), { params: Promise.resolve({ host: 'site.example' }) })
  expect(response.status).toBe(200)
  const html = await response.text()
  expect(html).toContain('Published website name')
  expect(html).not.toContain('Private draft name')
  expect(routeMocks.image).toHaveBeenCalledExactlyOnceWith('https://images.example/published.png')
  routeMocks.image.mockClear()
  routeMocks.preferences.websitePublished = false
  const hidden = await GET(new Request('https://site.example/opengraph-image'), { params: Promise.resolve({ host: 'site.example' }) })
  expect(hidden.status).toBe(404)
  expect(routeMocks.image).not.toHaveBeenCalled()
})

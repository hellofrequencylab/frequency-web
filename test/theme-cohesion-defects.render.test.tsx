import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MensworkPage } from '@/components/sites/menswork-page'
import { planMensworkPage } from '@/lib/sites/menswork-page'
import { MENSWORK_PAGE_CSS } from '@/components/sites/menswork-page-css'
import { FREQUENCY_PAGE_CSS } from '@/components/sites/frequency-page-css'
import { DESIGNER_BLOCKS_CSS } from '@/components/sites/designer-blocks-css'

// The three render defects the theme audit found (LIVE-1851, docs/THEME-COHESION.md).

const links = { origin: 'https://frequency.example', slug: 'demo', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }
const live = { events: [], circles: [], journeys: [] }
const page = (blocks: any[]) => renderToStaticMarkup(<MensworkPage blocks={blocks} plan={planMensworkPage(blocks)} live={live} links={links} origin={links.origin} pageTitle="Home" renderOther={() => null} />)

describe('Bold Hero at 390', () => {
  it('draws the stack headline smaller under 640px, so a long word is not clipped', () => {
    const html = page([{ type: 'Hero', props: { id: 'h', title: 'A community that moves at your frequency', image: '/x.jpg' } }])
    expect(html).toContain('mw-hero-stack')
    expect(MENSWORK_PAGE_CSS).toMatch(/@media \(max-width:639px\)\{[^}]*\.mw-hero \.mw-hero-copy \.mw-display\{font-size:clamp\(2\.25rem,10vw,3\.75rem\)/)
    expect(MENSWORK_PAGE_CSS).toMatch(/\.mw-hero-stack \.mw-hero-copy \.mw-display\{font-size:clamp\(3\.75rem,8\.5vw,7\.5rem\);overflow-wrap:break-word\}/)
  })
})

describe('Default (Frequency theme) sections', () => {
  it('are dressed by a sheet scoped to the site root the chrome always draws (the audit saw them bare only because its harness left that root off)', () => {
    expect(FREQUENCY_PAGE_CSS).toContain('[data-house-site]:not([data-house-theme="menswork"]) .mw-hero')
    expect(readFileSync('components/sites/site-chrome.tsx', 'utf8')).toMatch(/^\s*data-house-site=""$/m)
    const html = page([{ type: 'Hero', props: { id: 'h', title: 'Hello' } }])
    expect(html).toContain('mw-hero')
    expect(html).toContain('mw-display')
  })
})

describe('Designer services at 390', () => {
  it('lets the stylesheet, not an inline --dz-cols, collapse the columns', () => {
    const src = readFileSync('components/page-editor/blocks/designer.tsx', 'utf8')
    expect(src).not.toMatch(/'--dz-cols':/)
    expect(src).toMatch(/'--dz-cols-wide':/)
    expect(DESIGNER_BLOCKS_CSS).toContain('--dz-cols:var(--dz-cols-wide,4)')
    expect(DESIGNER_BLOCKS_CSS).toMatch(/max-width:900px\)\{[\s\S]*\.dz-services\{--dz-cols:2\}/)
    expect(DESIGNER_BLOCKS_CSS).toMatch(/max-width:560px\)\{[^\n]*\.dz-services\{--dz-cols:1\}/)
  })
})

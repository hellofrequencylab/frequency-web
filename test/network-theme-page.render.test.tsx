import { existsSync, readFileSync } from 'node:fs'
import { createSpaceHref } from '@/lib/create-space/href'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyNetwork } from '@/components/frequency/site/pages/themes/frequency-network'
import { NETWORK_KITS, NETWORK_LAYOUTS, NETWORK_SURFACES, networkLayoutShot, networkShot } from '@/lib/themes/network-feature-data'
import { THEME_LIBRARY } from '@/lib/themes/library'

const html = renderToStaticMarkup(<FrequencyNetwork />)

describe('the Network Theme Kit page (/themes/network)', () => {
  it('opens with the title and subtitle, then the copy and buttons, then the preview, then a lead-in', () => {
    const h1 = html.indexOf('<h1')
    const lead = html.indexOf('nf-lead')
    const ctas = html.indexOf('class="ctas"')
    const stage = html.indexOf('nf-hero-shot')
    const more = html.indexOf('nf-more')
    expect(h1).toBeGreaterThan(0)
    expect(h1).toBeLessThan(lead)
    expect(lead).toBeLessThan(ctas)
    expect(ctas).toBeLessThan(stage)
    expect(stage).toBeLessThan(more)
    expect(html).toContain('Theme Kit')
    expect(html).toContain('href="#why"')
  })

  it('keeps a surface qualifier a small tucked label, never headline size', () => {
    expect(html).toContain('<small class="nf-q">Link Page</small>')
    expect(html).toContain('<small class="nf-q">Profile</small>')
    expect(html).toContain('Email template')
    expect(html).not.toMatch(/<h[12][^>]*>[^<]*\(Link Page\)/)
    expect(html).not.toContain('(Link Page)')
  })

  it('previews Website, Spotlight, Space and Email, the thirteen profiles and six layouts', () => {
    for (const s of NETWORK_SURFACES) expect(html).toContain(`>${s.label}`)
    for (const k of NETWORK_KITS) expect(html).toContain(`${k.name}</button>`)
    expect(NETWORK_KITS).toHaveLength(13)
    expect(NETWORK_LAYOUTS).toHaveLength(6)
    for (const l of NETWORK_LAYOUTS) expect(html).toContain(l.sub)
  })

  it('says what is ready and what is on the way from the library catalog, and never more', () => {
    const entry = THEME_LIBRARY.find((t) => t.id === 'network-kit')!
    const soon = entry.surfaces.filter((s) => s.status === 'soon' && s.id !== 'space' && s.id !== 'email').length
    // Space and Email have no picture yet, so the page always says they are on the way (never more than the product).
    expect(html.match(/nf-st soon/g)?.length ?? 0).toBe(soon + 2)
    expect(html).not.toContain('spacedesk')
    expect(html).toContain('Frequency keeps its frame')
  })

  it('has a real picture on disk for every profile website and Spotlight and every layout', () => {
    for (const k of NETWORK_KITS) for (const shot of ['site', 'spot']) expect(existsSync(`public${networkShot(k.id, shot)}`), `${k.id} ${shot}`).toBe(true)
    for (const l of NETWORK_LAYOUTS) expect(existsSync(`public${networkLayoutShot(l.id)}`), l.id).toBe(true)
  })

  it('uses the design system iPhone frame and starts a Space wearing Network', () => {
    expect(html.match(/class="nf-ios"/g)?.length ?? 0).toBeGreaterThanOrEqual(7)
    expect(html).toContain(createSpaceHref('network-kit'))
    expect(html).toContain('9:41')
  })

  it('is voiced and tokened: no em dash, no violet word, no weekly promise, no colour outside the kit accent', () => {
    expect(html).not.toMatch(/—/)
    expect(html).not.toMatch(/midnight|cohort|every (monday|tuesday|wednesday|thursday|friday)|each week|a week/i)
    expect(html.replace(/--c:#[0-9a-fA-F]{6}/g, '')).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
    const css = readFileSync('components/frequency/site/pages/themes/network-feature.css', 'utf8')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
  })
})

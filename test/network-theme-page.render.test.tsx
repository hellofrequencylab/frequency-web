import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyNetwork } from '@/components/frequency/site/pages/themes/frequency-network'
import { NETWORK_KITS, NETWORK_LAYOUTS, NETWORK_SURFACES, networkLayoutShot, networkShot } from '@/lib/themes/network-feature-data'
import { THEME_LIBRARY } from '@/lib/themes/library'

const html = renderToStaticMarkup(<FrequencyNetwork />)

describe('the Network Theme Kit page (/themes/network)', () => {
  it('has the design page sections in the design page order', () => {
    const labels = [...html.matchAll(/data-screen-label="([^"]+)"/g)].map((m) => m[1])
    expect(labels).toEqual([
      '01 Hero',
      '03 Today',
      '04 Theme preview',
      '05 Inside the kit',
      '06 Make it yours',
      '07 Thirteen kits',
      '08 What carries over',
      '09 Built right',
      '10 Questions',
      '11 Setup',
      '12 Start',
    ])
    expect(html).not.toContain('Where Network shows up')
    expect(html).not.toContain('Six ways to lay out')
    expect(html).not.toContain('Start with what you need')
  })

  it('opens with the title, the copy and the buttons, then the four surfaces', () => {
    const h1 = html.indexOf('<h1')
    const lead = html.indexOf('nf-lead')
    const ctas = html.indexOf('class="ctas"')
    const flow = html.indexOf('nf-flow')
    expect(h1).toBeGreaterThan(0)
    expect(h1).toBeLessThan(lead)
    expect(lead).toBeLessThan(ctas)
    expect(ctas).toBeLessThan(flow)
    expect(html).toContain('Theme Kit')
    for (const n of ['01 · Day one', '02 · On the network', '03 · Your own domain', '04 · In the inbox']) expect(html).toContain(n)
  })

  it('keeps a surface qualifier a small tucked label, never headline size', () => {
    expect(html).toContain('<small class="nf-q">Link Page</small>')
    expect(html).toContain('<small class="nf-q">Profile</small>')
    expect(html).toContain('Email template')
    expect(html).not.toMatch(/<h[12][^>]*>[^<]*\(Link Page\)/)
  })

  it('previews Website, Space, Spotlight and Email, the thirteen profiles and a picture for each surface', () => {
    for (const s of NETWORK_SURFACES) expect(html).toContain(`>${s.label.replace(' template', '')}`)
    for (const k of NETWORK_KITS) expect(html).toContain(`${k.name}</span></button>`)
    expect(NETWORK_KITS).toHaveLength(13)
    expect(NETWORK_LAYOUTS).toHaveLength(6)
    expect(html).toContain('More than a homepage.')
    expect(html).toContain('/spaces/new?niche=general&amp;theme=network-kit')
  })

  it('says what is ready and what is on the way from the library catalog, and never more', () => {
    const entry = THEME_LIBRARY.find((t) => t.id === 'network-kit')!
    const soon = entry.surfaces.filter((s) => s.status === 'soon' && s.id !== 'space' && s.id !== 'email').length
    expect(html.match(/nf-st soon/g)?.length ?? 0).toBe(soon + 2)
    expect(html).not.toContain('spacedesk')
    expect(html).toContain('Frequency keeps its frame')
  })

  it('has a real picture on disk for every profile, the Space, the emails and every layout', () => {
    for (const k of NETWORK_KITS) for (const shot of ['site', 'spot', 'email']) expect(existsSync(`public${networkShot(k.id, shot)}`), `${k.id} ${shot}`).toBe(true)
    for (const shot of ['space', 'spacephone']) expect(existsSync(`public${networkShot('general', shot)}`), shot).toBe(true)
    for (const t of ['welcome', 'dates', 'receipt'] as const) expect(existsSync(`public${networkShot('general', 'email', t)}`), t).toBe(true)
    for (const l of NETWORK_LAYOUTS) expect(existsSync(`public${networkLayoutShot(l.id)}`), l.id).toBe(true)
  })

  it('uses the design system iPhone frame', () => {
    expect(html.match(/class="nf-ios"/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
    expect(html).toContain('9:41')
  })

  it('is voiced and tokened: no em dash, no violet word, no weekly promise, no color outside the kit accent', () => {
    expect(html).not.toMatch(/—/)
    expect(html).not.toMatch(/midnight|cohort|every (monday|tuesday|wednesday|thursday|friday)|each week|a week|weekly/i)
    expect(html.replace(/--c:#[0-9a-fA-F]{6}/g, '')).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
    const css = readFileSync('components/frequency/site/pages/themes/network-feature.css', 'utf8')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
  })
})

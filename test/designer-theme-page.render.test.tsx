import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyDesigner } from '@/components/frequency/site/pages/themes/frequency-designer'
import { DESIGNER_KITS, DESIGNER_LAYOUTS, DESIGNER_SURFACES, designerLayoutShot, designerShot } from '@/lib/themes/designer-feature-data'
import { THEME_LIBRARY } from '@/lib/themes/library'

const html = renderToStaticMarkup(<FrequencyDesigner />)

describe('the Designer Theme Kit page (/themes/designer)', () => {
  it('opens with the title and subtitle, then the copy and buttons, then the preview, then a lead-in', () => {
    const h1 = html.indexOf('<h1')
    const lead = html.indexOf('df-lead')
    const ctas = html.indexOf('class="ctas"')
    const stage = html.indexOf('df-hero-shot')
    const more = html.indexOf('df-more')
    expect(h1).toBeGreaterThan(0)
    expect(h1).toBeLessThan(lead)
    expect(lead).toBeLessThan(ctas)
    expect(ctas).toBeLessThan(stage)
    expect(stage).toBeLessThan(more)
    expect(html).toContain('Design it once.')
    expect(html).toContain('Theme Kit')
    expect(html).toContain('href="#why"')
  })

  it('keeps a surface qualifier a small tucked label, never headline size', () => {
    expect(html).toContain('<small class="df-q">Link Page</small>')
    expect(html).not.toMatch(/<h[12][^>]*>[^<]*\(Link Page\)/)
    expect(html).not.toContain('(Link Page)')
  })

  it('previews Website, Spotlight, Space and Email, and the thirteen profiles', () => {
    for (const s of DESIGNER_SURFACES) expect(html).toContain(`>${s.label}`)
    for (const k of DESIGNER_KITS) expect(html).toContain(`${k.name}</button>`)
    expect(DESIGNER_KITS).toHaveLength(13)
    expect(DESIGNER_LAYOUTS).toHaveLength(6)
    for (const l of DESIGNER_LAYOUTS) expect(html).toContain(l.sub)
  })

  it('says what is ready and what is on the way from the library catalog, and never more', () => {
    const designer = THEME_LIBRARY.find((t) => t.id === 'designer')!
    const status = Object.fromEntries(designer.surfaces.map((s) => [s.id, s.status]))
    const soon = Object.values(status).filter((s) => s === 'soon').length
    expect(html.match(/df-st soon/g)?.length ?? 0).toBe(status.email === 'soon' ? 1 : 0)
    expect(html.match(/df-st ready/g)?.length ?? 0).toBeGreaterThan(0)
    expect(soon).toBeGreaterThanOrEqual(0)
    expect(html).toContain('Frequency keeps its frame')
  })

  it('has a real picture on disk for every surface of every profile and every Spotlight layout', () => {
    for (const k of DESIGNER_KITS) for (const shot of ['site', 'spot', 'spacedesk', 'email']) expect(existsSync(`public${designerShot(k.id, shot)}`), `${k.id} ${shot}`).toBe(true)
    for (const l of DESIGNER_LAYOUTS) expect(existsSync(`public${designerLayoutShot(l.id)}`), l.id).toBe(true)
  })

  it('uses the design system iPhone frame and starts a Space wearing Designer', () => {
    expect(html.match(/class="df-ios"/g)?.length ?? 0).toBeGreaterThanOrEqual(7)
    expect(html).toContain('/spaces/new?theme=designer')
    expect(html).toContain('9:41')
  })

  it('is voiced and tokened: no em dash, no old classic entry, no hard figures, no colour outside the kit accent', () => {
    expect(html).not.toMatch(/—/)
    expect(html).not.toMatch(/classic/i)
    expect(html).not.toMatch(/2\.7|61%|under 5%/)
    expect(html.replace(/--c:#[0-9a-fA-F]{6}/g, '')).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
    const css = readFileSync('components/frequency/site/pages/themes/designer-feature.css', 'utf8')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
  })
})

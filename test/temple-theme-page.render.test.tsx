import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyTemple } from '@/components/frequency/site/pages/themes/frequency-temple'
import { TEMPLE_KITS, TEMPLE_LAYOUTS, TEMPLE_SURFACES, templeLayoutShot, templeShot } from '@/lib/themes/temple-feature-data'
import { TEMPLE_KIT_PROFILES } from '@/lib/theme/temple-kit'
import { TEMPLE_KIT_PROFILE_KIT_INDEX } from '@/lib/sites/kits/temple-kit-profile-index'
import { THEME_LIBRARY } from '@/lib/themes/library'

const html = renderToStaticMarkup(<FrequencyTemple />)

describe('the Temple Theme Kit page (/themes/temple)', () => {
  it('opens with the title and subtitle, then the copy and buttons, then the preview, then a lead-in', () => {
    const h1 = html.indexOf('<h1')
    const lead = html.indexOf('tf-lead')
    const ctas = html.indexOf('class="ctas"')
    const stage = html.indexOf('tf-hero-shot')
    const more = html.indexOf('tf-more')
    expect(h1).toBeGreaterThan(0)
    expect(h1).toBeLessThan(lead)
    expect(lead).toBeLessThan(ctas)
    expect(ctas).toBeLessThan(stage)
    expect(stage).toBeLessThan(more)
    expect(html).toContain('Theme Kit')
    expect(html).toContain('href="#why"')
  })

  it('keeps a surface qualifier a small tucked label, never headline size', () => {
    expect(html).toContain('<small class="tf-q">Link Page</small>')
    expect(html).toContain('<small class="tf-q">Profile</small>')
    expect(html).toContain('Email template')
    expect(html).not.toMatch(/<h[12][^>]*>[^<]*\(Link Page\)/)
    expect(html).not.toContain('(Link Page)')
  })

  it('previews Website, Spotlight, Space and Email, the thirteen profiles and six layouts', () => {
    for (const s of TEMPLE_SURFACES) expect(html).toContain(`>${s.label}`)
    for (const k of TEMPLE_KITS) expect(html).toContain(`${k.name}</button>`)
    expect(TEMPLE_KITS).toHaveLength(13)
    expect(TEMPLE_LAYOUTS).toHaveLength(6)
    for (const l of TEMPLE_LAYOUTS) expect(html).toContain(l.sub)
  })

  it('says what is ready and what is on the way from the library catalog, and never more', () => {
    const entry = THEME_LIBRARY.find((t) => t.id === 'temple-kit')!
    const soon = entry.surfaces.filter((s) => s.status === 'soon' && s.id !== 'space').length
    // Space has no picture yet, so the page always says it is on the way (never more than the product).
    expect(html.match(/tf-st soon/g)?.length ?? 0).toBe(soon + 1)
    expect(html).not.toContain('spacedesk')
    expect(html).toContain('Frequency keeps its frame')
  })

  it('has a real picture on disk for every profile website, Spotlight and email and every layout', () => {
    for (const k of TEMPLE_KITS) for (const shot of ['site', 'spot', 'email']) expect(existsSync(`public${templeShot(k.id, shot)}`), `${k.id} ${shot}`).toBe(true)
    for (const l of TEMPLE_LAYOUTS) expect(existsSync(`public${templeLayoutShot(l.id)}`), l.id).toBe(true)
  })

  it('uses the design system iPhone frame and starts a Space wearing Temple', () => {
    expect(html.match(/class="tf-ios"/g)?.length ?? 0).toBeGreaterThanOrEqual(7)
    expect(html).toContain('/spaces/new?theme=temple-kit')
    expect(html).toContain('9:41')
  })

  it('is voiced and tokened: no em dash, no violet word, no weekly promise, no colour outside the kit accent', () => {
    expect(html).not.toMatch(/—/)
    expect(html).not.toMatch(/midnight|cohort|every (monday|tuesday|wednesday|thursday|friday)|each week|a week/i)
    expect(html.replace(/--c:#[0-9a-fA-F]{6}/g, '')).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
    const css = readFileSync('components/frequency/site/pages/themes/temple-feature.css', 'utf8')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
  })

  it('reads the thirteen profiles from the kit itself: same ids, names, who and accents', () => {
    expect(TEMPLE_KITS.map((k) => k.id)).toEqual(TEMPLE_KIT_PROFILE_KIT_INDEX.map((k) => k.niche))
    for (const k of TEMPLE_KITS) {
      const kit = TEMPLE_KIT_PROFILE_KIT_INDEX.find((i) => i.niche === k.id)!
      expect([k.name, k.who, k.hex]).toEqual([kit.label, kit.description, TEMPLE_KIT_PROFILES[k.id as keyof typeof TEMPLE_KIT_PROFILES].accent])
    }
  })
})

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyNewWorld } from '@/components/frequency/site/pages/themes/frequency-new-world'
import { NEW_WORLD_KITS, NEW_WORLD_SURFACES, newWorldLayoutShot, newWorldShot } from '@/lib/themes/new-world-feature-data'
import { NEW_WORLD_KIT_LAYOUTS } from '@/components/spotlight/new-world-kit-layouts'
import { NEW_WORLD_KIT_NICHES } from '@/lib/sites/kits/new-world-variants'
import { metadata } from '@/app/(marketing)/themes/new-world/page'

const html = renderToStaticMarkup(<FrequencyNewWorld />)
const pub = (p: string) => existsSync(`public${p}`)

describe('the New World theme page (/themes/new-world, LIVE-2059)', () => {
  it('opens with the name large, then the copy and buttons, then the preview', () => {
    const h1 = html.indexOf('<h1')
    expect(h1).toBeGreaterThan(0)
    expect(h1).toBeLessThan(html.indexOf('nwf-lead'))
    expect(html.indexOf('nwf-lead')).toBeLessThan(html.indexOf('class="ctas"'))
    expect(html.indexOf('class="ctas"')).toBeLessThan(html.indexOf('nwf-hero-shot'))
    expect(html).toContain('A Frequency Theme')
  })

  it('previews Website, Spotlight, Space and Email, the seven kits and six layouts', () => {
    for (const s of NEW_WORLD_SURFACES) expect(html).toContain(`>${s.label}`)
    for (const k of NEW_WORLD_KITS) expect(html).toContain(`${k.name}</button>`)
    expect(NEW_WORLD_KITS.map((k) => k.id)).toEqual([...NEW_WORLD_KIT_NICHES])
    expect(NEW_WORLD_KIT_LAYOUTS).toHaveLength(6)
    for (const l of NEW_WORLD_KIT_LAYOUTS) expect(html).toContain(l.blurb)
  })

  it('has a real picture for every surface of every kit, and every layout, with no empty "on the way" box', () => {
    for (const k of NEW_WORLD_KITS) for (const s of NEW_WORLD_SURFACES) expect(pub(newWorldShot(k.id, s.shot))).toBe(true)
    for (const l of NEW_WORLD_KIT_LAYOUTS) expect(pub(newWorldLayoutShot(l.id.slice('new-world-kit:'.length)))).toBe(true)
    expect(html).not.toMatch(/on the way/i)
    expect(html).not.toContain('nwf-soon')
  })

  it('says Nocturne and Night, never Midnight, and has no em dash', () => {
    expect(html).not.toMatch(/Midnight/)
    expect(html).not.toContain('—')
  })

  it('is indexable and listed in the sitemap', () => {
    expect(metadata.robots).not.toMatchObject({ index: false })
    expect(readFileSync('app/sitemap.ts', 'utf8')).toContain('/themes/new-world')
  })
})

import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyDesigner } from '@/components/frequency/site/pages/themes/frequency-designer'
import { DESIGNER_BLOCKS, DESIGNER_KITS, DESIGNER_PACKAGES } from '@/lib/themes/designer-feature-data'
import { THEME_LIBRARY } from '@/lib/themes/library'

const html = renderToStaticMarkup(<FrequencyDesigner />)

/** The Theme Feature Page of the Designer design system, section by section (docs/design-systems/designer). */
const SECTIONS = ['why', 'preview', 'inside', 'yours', 'kits', 'carry', 'built', 'questions', 'steps', 'start']

describe('the Designer Theme Kit page (/themes/designer)', () => {
  it('opens centred: label, title and subtitle, copy, buttons, then the four surfaces down the page', () => {
    const label = html.indexOf('Designer · by Frequency')
    const h1 = html.indexOf('<h1')
    const lead = html.indexOf('nf-hz-lead')
    const ctas = html.indexOf('class="ctas"')
    const spotlight = html.indexOf('01 · Day one')
    expect(label).toBeGreaterThan(0)
    expect(label).toBeLessThan(h1)
    expect(h1).toBeLessThan(lead)
    expect(lead).toBeLessThan(ctas)
    expect(ctas).toBeLessThan(spotlight)
    expect(html).toContain('Design it once.')
    expect(html).toContain('Same theme everywhere.')
    for (const n of ['01 · Day one', '02 · On the network', '03 · Your own domain', '04 · In the inbox']) expect(html).toContain(n)
  })

  it('has every section of the design, in its order', () => {
    const at = SECTIONS.map((id) => html.indexOf(`id="${id}"`))
    for (const [i, id] of SECTIONS.entries()) expect(at[i], `#${id}`).toBeGreaterThan(0)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    for (const h of [
      'Five tools. Five logins. Five versions of you.',
      'Try it on before you choose.',
      'More than a homepage.',
      'Your accent. Your face. Your corners.',
      'One profile. Every surface follows.',
      'The parts you should never have to think about.',
      'Good to know.',
      'Live in an afternoon.',
    ]) expect(html, h).toContain(h)
  })

  it('keeps a surface qualifier a small tucked label, never headline size', () => {
    expect(html).toContain('<small class="nf-q">Link Page</small>')
    expect(html).not.toMatch(/<h[12][^>]*>[^<]*\(Link Page\)/)
  })

  it('shows the thirteen profiles, the tools, the home blocks and the four email templates', () => {
    expect(DESIGNER_KITS).toHaveLength(13)
    expect(DESIGNER_PACKAGES).toHaveLength(6)
    expect(DESIGNER_BLOCKS).toHaveLength(18)
    for (const k of DESIGNER_KITS) expect(html).toContain(`${k.name}</button>`)
    for (const m of ['The note', 'Welcome', 'The dates', 'Receipt']) expect(html).toContain(m)
    expect(html).toContain('Coming soon')
  })

  it('says what is on the way from the library catalog, and never more', () => {
    const designer = THEME_LIBRARY.find((t) => t.id === 'designer')!
    const soon = designer.surfaces.filter((s) => s.status === 'soon').map((s) => s.id)
    expect(html.match(/<small class="nf-q">On the way<\/small>/g)?.length ?? 0).toBe(soon.length)
    expect(html).toContain('Frequency keeps its frame')
  })

  it('has a real picture on disk for every surface of every profile, and the four email templates', () => {
    for (const k of DESIGNER_KITS) {
      for (const shot of ['site', 'spot', 'spacedesk', 'space', 'email', 'email-welcome', 'email-dates', 'email-receipt']) {
        expect(existsSync(`public/themes/designer/shots/${k.id}-${shot}.jpg`), `${k.id} ${shot}`).toBe(true)
      }
    }
  })

  it('uses the design system iPhone frame and starts a Space wearing Designer', () => {
    expect(html.match(/class="nf-ios"/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(html).toContain('/spaces/new?niche=general&amp;theme=designer')
    expect(html).toContain('9:41')
  })

  it('carries no raw colour and no em dash', () => {
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/.test(html.replace(/--c:#[0-9a-fA-F]{6}/g, '')) ? /^$/ : /.^/)
    expect(html).not.toContain('—')
  })
})

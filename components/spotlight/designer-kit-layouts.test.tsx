import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SpotlightShell } from './spotlight-shell'
import { DesignerKitSpotlightLayout } from './designer-kit-layouts'
import { DESIGNER_KIT_LAYOUTS_CSS } from './designer-kit-layouts-css'
import { THEME_PRESETS, validateSpotlightTheme, EMPTY_THEME } from '@/lib/spotlight/theme'
import { spotlightLayoutsFor } from '@/lib/spotlight/layouts'
import { DESIGNER_KIT_SPOTLIGHT_PROFILES, designerKitSpotlightContent } from '@/lib/spotlight/designer-kit-content'
import { DESIGNER_PROFILES, designerProfileAccent } from '@/lib/sites/kits/designer-profile-variants'
import { DESIGNER_TOKENS_CSS } from '@/lib/theme/designer'

const IDS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const BANNED = new RegExp(['—', 'com{2}is{2}ions?', 'affiliate', 'kickback', 'violet', 'every (monday|tuesday|wednesday|thursday|friday|week|season)', 'a week', 'weekly', 'unlock', 'your city'].join('|'), 'i')
const designerPreset = THEME_PRESETS.find((p) => p.id === 'designer')!

function shellFor(layout: string, kit = 'general', sample = true) {
  const theme = validateSpotlightTheme({ ...designerPreset.theme, layout, kit })
  const data = {
    profile: { display_name: 'Your Studio', handle: 'yourstudio', avatar_url: null, header_image_url: null, bio: null, community_role: null, nexus_regions: null, profile_theme: null },
    background: { assetPath: null }, stickers: [], theme, layout: { blocks: [] },
  } as unknown as Parameters<typeof SpotlightShell>[0]['data']
  return renderToStaticMarkup(<SpotlightShell data={data} showBio={false} sampleContent={sample}><div>body</div></SpotlightShell>)
}

describe('Designer Theme Kit Spotlight layouts', () => {
  it('registers the six layouts of the design for designer-kit, beside network-kit, and none for other themes', () => {
    expect(spotlightLayoutsFor('designer-kit').map((l) => l.id.split(':')[1])).toEqual(IDS)
    expect(spotlightLayoutsFor('designer-kit').every((l) => l.id.startsWith('designer-kit:'))).toBe(true)
    expect(spotlightLayoutsFor('network-kit').map((l) => l.id.split(':')[1])).toEqual(IDS)
    expect(spotlightLayoutsFor('midnight')).toEqual([])
  })

  it('leaves the existing Designer preset and every other theme\'s validated output unchanged', () => {
    expect(validateSpotlightTheme(EMPTY_THEME)).toEqual(EMPTY_THEME)
    expect('layout' in validateSpotlightTheme(designerPreset.theme)).toBe(false)
    expect(validateSpotlightTheme({ ...designerPreset.theme, layout: 'designer-kit:story', kit: 'coaches' })).toMatchObject({ layout: 'designer-kit:story', kit: 'coaches' })
    expect('layout' in validateSpotlightTheme({ ...designerPreset.theme, layout: 'designer-kit:nope' })).toBe(false)
  })

  it('renders each layout through the real Spotlight shell without a raw colour', () => {
    const dump = process.env.DK_SPOT_DUMP
    if (dump) mkdirSync(dump, { recursive: true })
    for (const id of IDS) {
      const html = shellFor(`designer-kit:${id}`)
      expect(html, id).toContain(`data-layout="designer-kit:${id}"`)
      expect(html, id).toContain('data-house-theme="designer"')
      expect(html, id).not.toContain('>body<')
      expect(html.slice(html.indexOf('data-house-theme')).replace(/<style>[\s\S]*?<\/style>/, ''), id).not.toMatch(RAW_COLOR)
      expect(html, id).not.toMatch(BANNED)
      expect(html, id).not.toContain('href="#"')
      expect(html, id).toContain('Spotlight on Frequency')
      if (dump) writeFileSync(join(dump, `${id}.html`), html)
    }
    // The proof renders (DK_SPOT_DUMP=<folder>): every layout a profile can use, in the sample and the live state.
    if (dump) {
      for (const p of DESIGNER_PROFILES) {
        for (const l of designerKitSpotlightContent(p).layouts) {
          writeFileSync(join(dump, `${p}__${l}__sample.html`), shellFor(`designer-kit:${l}`, p, true))
          writeFileSync(join(dump, `${p}__${l}__live.html`), shellFor(`designer-kit:${l}`, p, false))
        }
      }
    }
    expect(DESIGNER_KIT_LAYOUTS_CSS).not.toMatch(RAW_COLOR)
    expect(readFileSync(join(__dirname, 'designer-kit-layouts.tsx'), 'utf8').replace(/\/\/.*$/gm, '')).not.toMatch(RAW_COLOR)
  })

  it('wears the profile accent from the design and follows the per-profile rules', () => {
    expect([...DESIGNER_KIT_SPOTLIGHT_PROFILES]).toEqual(DESIGNER_PROFILES)
    for (const p of DESIGNER_PROFILES) expect(designerKitSpotlightContent(p).accent, p).toEqual(designerProfileAccent(p))
    const hosts = designerKitSpotlightContent('hosts')
    expect(hosts.layouts).not.toContain('calendar-first')
    expect(designerKitSpotlightContent('studios').layouts).toContain('calendar-first')
    expect(designerKitSpotlightContent('markets').layouts).not.toContain('shop-front')
    expect(designerKitSpotlightContent('coaches').doors.map((d) => d.key)).toEqual(['book', 'sell', 'publish'])
    expect(designerKitSpotlightContent('wellness').doors.map((d) => d.key)).toEqual(['book', 'belong', 'sell', 'publish'])
    // A profile id the design does not have falls back to the Design studio.
    expect(designerKitSpotlightContent('nope').profile).toBe('general')
    for (const p of DESIGNER_PROFILES) {
      const c = designerKitSpotlightContent(p)
      expect(c.layouts, p).toContain(c.defaultLayout)
      expect(JSON.stringify(c), p).not.toMatch(BANNED)
      expect(JSON.stringify(c), p).not.toMatch(/\b\d+ (members|reviews|projects|clients)\b|4\.9/)
      const html = renderToStaticMarkup(<DesignerKitSpotlightLayout layout={`designer-kit:${c.defaultLayout}`} content={c} />)
      expect(html).toContain(`data-profile="${p}"`)
      expect(html).toContain(`.dzs[data-profile="${p}"]{--color-primary:${c.accent.base}`)
      for (const l of c.layouts) expect(renderToStaticMarkup(<DesignerKitSpotlightLayout layout={`designer-kit:${l}`} content={c} />), `${p} ${l}`).toContain(c.name)
    }
  })

  it('ships no invented date, price, number or testimonial on a live page', () => {
    for (const p of DESIGNER_PROFILES) {
      const live = designerKitSpotlightContent(p, { sample: false })
      expect(live.dates, p).toEqual([])
      expect(live.quote, p).toBeNull()
      expect(live.letter, p).toBeNull()
      expect(live.offerings.every((o) => o.price === null && o.minutes === null), p).toBe(true)
      for (const l of live.layouts) {
        const html = renderToStaticMarkup(<DesignerKitSpotlightLayout layout={`designer-kit:${l}`} content={live} />).replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ')
        expect(html, `${p} ${l}`).not.toMatch(/\$\d|\bmin\b|\bleft\b|Save a spot/)
      }
    }
  })

  it('does not touch the Designer website tokens', () => {
    expect(DESIGNER_TOKENS_CSS).not.toContain('dzs-')
    expect(DESIGNER_KIT_LAYOUTS_CSS).toContain('.dzs{')
    expect(DESIGNER_KIT_LAYOUTS_CSS).not.toContain('data-house-theme')
  })

  it('leaves a Network Spotlight layout alone', () => {
    const network = validateSpotlightTheme({ ...THEME_PRESETS.find((p) => p.id === 'network-kit')!.theme, layout: 'network-kit:story', kit: 'coaches' })
    const data = { profile: { display_name: 'Your Network', handle: 'n', avatar_url: null, header_image_url: null, bio: null, community_role: null, nexus_regions: null, profile_theme: null }, background: { assetPath: null }, stickers: [], theme: network, layout: { blocks: [] } } as unknown as Parameters<typeof SpotlightShell>[0]['data']
    const html = renderToStaticMarkup(<SpotlightShell data={data} sampleContent><div>body</div></SpotlightShell>)
    expect(html).toContain('data-house-theme="network-kit"')
    expect(html).not.toContain('dzs')
  })
})

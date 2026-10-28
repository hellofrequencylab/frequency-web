import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SpotlightShell } from './spotlight-shell'
import { NetworkKitSpotlightLayout } from './network-kit-layouts'
import { NETWORK_KIT_LAYOUTS_CSS } from './network-kit-layouts-css'
import { THEME_PRESETS, validateSpotlightTheme, EMPTY_THEME } from '@/lib/spotlight/theme'
import { spotlightLayoutsFor } from '@/lib/spotlight/layouts'
import { networkKitSpotlightContent } from '@/lib/spotlight/network-kit-content'
import { NETWORK_KIT_PROFILES } from '@/lib/theme/network-kit'
import type { SpotlightData } from '@/lib/spotlight/data'

const IDS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const preset = THEME_PRESETS.find((p) => p.id === 'network-kit')!

function shellFor(layout: string, kit = 'general', scheme?: Record<string, unknown>) {
  const theme = validateSpotlightTheme({ ...preset.theme, ...scheme, layout, kit })
  const data = {
    profile: { display_name: 'Your Network', handle: 'yournetwork', avatar_url: null, header_image_url: null, bio: null, community_role: null, nexus_regions: null, profile_theme: null },
    background: { assetPath: null }, stickers: [], theme, layout: { blocks: [] },
  } as unknown as SpotlightData
  return renderToStaticMarkup(<SpotlightShell data={data} showBio={false} sampleContent><div>body</div></SpotlightShell>)
}

describe('Network Theme Kit Spotlight layouts', () => {
  it('registers the six layouts of the design for network-kit and none for other themes', () => {
    expect(spotlightLayoutsFor('network-kit').map((l) => l.id.split(':')[1])).toEqual(IDS)
    expect(spotlightLayoutsFor('midnight')).toEqual([])
    expect(THEME_PRESETS.filter((p) => p.id !== 'network-kit').every((p) => !('layout' in p.theme))).toBe(true)
  })

  it('keeps other themes\' validated output unchanged and drops unknown layouts', () => {
    expect(validateSpotlightTheme(EMPTY_THEME)).toEqual(EMPTY_THEME)
    expect('layout' in validateSpotlightTheme({ ...preset.theme, layout: 'midnight:stack' })).toBe(false)
    expect(validateSpotlightTheme(preset.theme).layout).toBe('network-kit:stack')
  })

  it('renders each layout through the real Spotlight shell without a raw colour', () => {
    const dump = process.env.NK_SPOT_DUMP
    if (dump) mkdirSync(dump, { recursive: true })
    for (const id of IDS) {
      const html = shellFor(`network-kit:${id}`)
      expect(html, id).toContain(`data-layout="network-kit:${id}"`)
      expect(html, id).not.toContain('>body<')
      expect(html.slice(html.indexOf('data-house-theme')).replace(/<style>[\s\S]*?<\/style>/, ''), id).not.toMatch(RAW_COLOR)
      expect(html, id).not.toContain('—')
      expect(html, id).not.toContain('href="#"')
      if (dump) writeFileSync(join(dump, `${id}.html`), html)
    }
    // Second scheme for the proof: the Mixers profile wears Coral.
    if (dump) writeFileSync(join(dump, 'stack-coral.html'), shellFor('network-kit:stack', 'hosts'))
    expect(NETWORK_KIT_LAYOUTS_CSS).not.toMatch(RAW_COLOR)
  })

  it('wears the profile scheme and follows the per-profile rules', () => {
    const hosts = networkKitSpotlightContent('hosts')
    expect(hosts.scheme).toBe('coral')
    expect(hosts.layouts).not.toContain('shop-front')
    expect(hosts.layouts).toContain('calendar-first')
    expect(networkKitSpotlightContent('venues').doors.map((d) => d.key)).toEqual(['gather', 'book', 'publish'])
    expect(networkKitSpotlightContent('markets').layouts).toContain('shop-front')
    for (const p of NETWORK_KIT_PROFILES) {
      const c = networkKitSpotlightContent(p)
      expect(c.layouts).toContain(c.defaultLayout)
      const copy = JSON.stringify(c)
      expect(copy, p).not.toMatch(/—|every (monday|tuesday|wednesday|thursday|friday|week)|a week|weekly|unlock/i)
      expect(copy, p).not.toMatch(/\d+ (members|reviews)|4\.9/)
      const html = renderToStaticMarkup(<NetworkKitSpotlightLayout layout={`network-kit:${c.defaultLayout}`} content={c} />)
      expect(html).toContain(`data-scheme="${c.scheme}"`)
    }
  })

  it('ships no invented date, price or testimonial on a live page', () => {
    const live = networkKitSpotlightContent('general', { sample: false })
    expect(live.dates).toEqual([])
    expect(live.offerings).toEqual([])
    expect(live.quote).toBeNull()
    expect(live.letter).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SpotlightShell } from './spotlight-shell'
import { TempleKitSpotlightLayout } from './temple-kit-layouts'
import { TEMPLE_KIT_LAYOUTS_CSS } from './temple-kit-layouts-css'
import { THEME_PRESETS, validateSpotlightTheme } from '@/lib/spotlight/theme'
import { spotlightLayoutsFor } from '@/lib/spotlight/layouts'
import { templeKitSpotlightContent } from '@/lib/spotlight/temple-kit-content'
import { TEMPLE_KIT_PROFILES } from '@/lib/theme/temple-kit'
import type { SpotlightData } from '@/lib/spotlight/data'

const IDS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const preset = THEME_PRESETS.find((p) => p.id === 'temple-kit')!

function shellFor(layout: string, kit = 'general', sample = true) {
  const theme = validateSpotlightTheme({ ...preset.theme, layout, kit })
  const data = {
    profile: { display_name: 'Temple', handle: 'temple', avatar_url: null, header_image_url: null, bio: null, community_role: null, nexus_regions: null, profile_theme: null },
    background: { assetPath: null }, stickers: [], theme, layout: { blocks: [] },
  } as unknown as SpotlightData
  return renderToStaticMarkup(<SpotlightShell data={data} showBio={false} sampleContent={sample}><div>body</div></SpotlightShell>)
}

describe('Temple Theme Kit Spotlight layouts', () => {
  it('registers the six layouts of the design for temple-kit', () => {
    expect(spotlightLayoutsFor('temple-kit').map((l) => l.id.split(':')[1])).toEqual(IDS)
    expect(validateSpotlightTheme(preset.theme).layout).toBe('temple-kit:stack')
    expect('layout' in validateSpotlightTheme({ ...preset.theme, layout: 'temple-kit:nope' })).toBe(false)
  })

  it('renders each layout through the real Spotlight shell without a raw colour', () => {
    const dump = process.env.TK_SPOT_DUMP
    if (dump) mkdirSync(dump, { recursive: true })
    for (const id of IDS) {
      const html = shellFor(`temple-kit:${id}`)
      expect(html, id).toContain(`data-layout="temple-kit:${id}"`)
      expect(html, id).toContain('data-house-theme="temple-kit"')
      expect(html, id).not.toContain('>body<')
      expect(html.slice(html.indexOf('data-house-theme')).replace(/<style>[\s\S]*?<\/style>/, ''), id).not.toMatch(RAW_COLOR)
      expect(html, id).not.toContain('—')
      expect(html, id).not.toContain('href="#"')
      if (dump) writeFileSync(join(dump, `${id}.html`), html)
    }
    if (dump) writeFileSync(join(dump, 'stack-markets.html'), shellFor('temple-kit:stack', 'markets'))
    expect(TEMPLE_KIT_LAYOUTS_CSS).not.toMatch(RAW_COLOR)
    expect(TEMPLE_KIT_LAYOUTS_CSS).not.toMatch(/var\(--shadow-/)
  })

  it('wears each of the thirteen profiles by accent only: same words, same layouts', () => {
    const base = JSON.stringify({ ...templeKitSpotlightContent('general'), profile: '' })
    for (const p of Object.keys(TEMPLE_KIT_PROFILES)) {
      const c = templeKitSpotlightContent(p)
      expect(c.profile).toBe(p)
      expect(JSON.stringify({ ...c, profile: '' }), p).toBe(base)
      const html = renderToStaticMarkup(<TempleKitSpotlightLayout layout="temple-kit:stack" content={c} />)
      expect(html).toContain(`data-kit="${p}"`)
      if (p !== 'general') expect(html).toContain(`[data-kit="${p}"]{--kit-accent:var(--accent-${p})`)
    }
    expect(templeKitSpotlightContent('nope').profile).toBe('general')
  })

  it('keeps the voice: no dash, price promise, cadence or invented count', () => {
    const copy = JSON.stringify(templeKitSpotlightContent('general'))
    expect(copy).not.toMatch(/—|\bevery (monday|tuesday|wednesday|thursday|friday|week)\b|\ba week\b|\bweekly\b|\bunlock\b|\bfree\b/i)
    expect(copy).not.toMatch(/\d+ (members|reviews)|4\.9/)
  })

  it('ships no invented date, price or testimonial on a live page', () => {
    const live = templeKitSpotlightContent('general', { sample: false })
    expect(live.dates).toEqual([])
    expect(live.offerings).toEqual([])
    expect(live.quote).toBeNull()
    expect(live.letter).toBeNull()
    expect(live.gift).toBeNull()
    const html = shellFor('temple-kit:shop-front', 'general', false)
    expect(html).not.toMatch(/\$\d/)
  })
})

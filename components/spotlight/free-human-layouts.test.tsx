import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SpotlightShell } from './spotlight-shell'
import { FreeHumanSpotlightLayout } from './free-human-layouts'
import { FREE_HUMAN_LAYOUTS_CSS } from './free-human-layouts-css'
import { THEME_PRESETS, validateSpotlightTheme } from '@/lib/spotlight/theme'
import { spotlightLayoutsFor } from '@/lib/spotlight/layouts'
import { freeHumanSpotlightContent } from '@/lib/spotlight/free-human-content'
import { FREE_HUMAN_PROFILES } from '@/lib/theme/free-human'
import type { SpotlightData } from '@/lib/spotlight/data'

const IDS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const preset = THEME_PRESETS.find((p) => p.id === 'free-human')!

function shellFor(layout: string, kit = 'general', sample = true) {
  const theme = validateSpotlightTheme({ ...preset.theme, layout, kit })
  const data = {
    profile: { display_name: 'Free Human', handle: 'freehuman', avatar_url: null, header_image_url: null, bio: null, community_role: null, nexus_regions: null, profile_theme: null },
    background: { assetPath: null }, stickers: [], theme, layout: { blocks: [] },
  } as unknown as SpotlightData
  return renderToStaticMarkup(<SpotlightShell data={data} showBio={false} sampleContent={sample}><div>body</div></SpotlightShell>)
}

describe('Free Human Theme Kit Spotlight layouts', () => {
  it('registers the six layouts of the design for free-human', () => {
    expect(spotlightLayoutsFor('free-human').map((l) => l.id.split(':')[1])).toEqual(IDS)
    expect(validateSpotlightTheme(preset.theme).layout).toBe('free-human:stack')
    expect('layout' in validateSpotlightTheme({ ...preset.theme, layout: 'free-human:nope' })).toBe(false)
  })

  it('renders each layout through the real Spotlight shell without a raw colour', () => {
    const dump = process.env.FH_SPOT_DUMP
    if (dump) mkdirSync(dump, { recursive: true })
    for (const id of IDS) {
      const html = shellFor(`free-human:${id}`)
      expect(html, id).toContain(`data-layout="free-human:${id}"`)
      expect(html, id).toContain('data-house-theme="free-human"')
      expect(html, id).not.toContain('>body<')
      expect(html.slice(html.indexOf('data-house-theme')).replace(/<style>[\s\S]*?<\/style>/, ''), id).not.toMatch(RAW_COLOR)
      expect(html, id).not.toContain('—')
      expect(html, id).not.toContain('href="#"')
      if (dump) writeFileSync(join(dump, `${id}.html`), html)
    }
    if (dump) writeFileSync(join(dump, 'stack-markets.html'), shellFor('free-human:stack', 'markets'))
    expect(FREE_HUMAN_LAYOUTS_CSS).not.toMatch(RAW_COLOR)
    expect(FREE_HUMAN_LAYOUTS_CSS).not.toMatch(/var\(--shadow-/)
  })

  it('wears each of the thirteen profiles by accent only: same words, same layouts', () => {
    const base = JSON.stringify({ ...freeHumanSpotlightContent('general'), profile: '' })
    for (const p of Object.keys(FREE_HUMAN_PROFILES)) {
      const c = freeHumanSpotlightContent(p)
      expect(c.profile).toBe(p)
      expect(JSON.stringify({ ...c, profile: '' }), p).toBe(base)
      const html = renderToStaticMarkup(<FreeHumanSpotlightLayout layout="free-human:stack" content={c} />)
      expect(html).toContain(`data-kit="${p}"`)
      if (p !== 'general') expect(html).toContain(`[data-kit="${p}"]{--kit-accent:var(--accent-${p})`)
    }
    expect(freeHumanSpotlightContent('nope').profile).toBe('general')
  })

  it('keeps the voice: no dash, price promise, cadence or invented count', () => {
    const copy = JSON.stringify(freeHumanSpotlightContent('general')).replace(/\/sites\/free-human\/[a-z0-9./-]+/g, '')
    expect(copy).not.toMatch(/—|\bevery (monday|tuesday|wednesday|thursday|friday|week)\b|\ba week\b|\bweekly\b|\bunlock\b|\bfree\b/i)
    expect(copy).not.toMatch(/\d+ (members|reviews)|4\.9/)
  })

  it('ships no invented date, price or testimonial on a live page', () => {
    const live = freeHumanSpotlightContent('general', { sample: false })
    expect(live.dates).toEqual([])
    expect(live.offerings).toEqual([])
    expect(live.quote).toBeNull()
    expect(live.letter).toBeNull()
    expect(live.gift).toBeNull()
    const html = shellFor('free-human:shop-front', 'general', false)
    expect(html).not.toMatch(/\$\d/)
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { config } from '@/lib/page-editor/config'
import { categoryKeysForSurface } from '@/lib/page-editor/palette-scope'
import { profilePaletteForKind } from '@/lib/entity-blocks/registry'
import { planHouseSections } from '@/lib/sites/house-theme'
import { planMensworkPage } from '@/lib/sites/menswork-page'
import { FREQUENCY_PAGE_CSS } from '@/components/sites/frequency-page-css'
import { MENSWORK_PAGE_CSS } from '@/components/sites/menswork-page-css'

// EVERY CORE BLOCK DISPLAYS IN BOTH SITE THEMES (owner ask 2026-10-11, ADR-1727): "If a user switches, each
// core block should easily display in the new theme." A site's blocks are planned and drawn ONCE, whichever
// theme it wears: Home through the house sections (lib/sites/house-theme.ts), a custom page through the
// site page sections (lib/sites/menswork-page.ts). The theme is only the stylesheet. So parity holds when
//   1. both themes route every block through the same planner (no theme branch in the plan), and
//   2. each theme's stylesheet answers every class the shared markup draws.
// A block the sections do not draw keeps the Space page's own render inside the themed band. That is a
// deliberate, listed choice here, never a silent fall-through: a new palette block fails this suite until
// it is given a section or added to the list.

/** Website page blocks that keep the Space page's own render (inside the themed `.mw-other` band). */
const PAGE_OWN_RENDER = new Set([
  // Layout wrappers: their children are blocks with their own render.
  'Container', 'Columns', 'SpaceLayout',
  // Space data cards the Space page already draws from its own rows.
  'SpaceIdentityHeader', 'SpaceCallout', 'SpaceAbout', 'SpaceHighlights', 'SpaceStats', 'SpaceQuickLinks', 'SpaceBooking',
  'SpaceAction', 'SpaceOfferings', 'SpaceContact', 'SpaceBusiness', 'SpaceTeam', 'SpaceReviews',
  // Marketing kit sections with a bespoke layout of their own.
  'StoryBeats', 'Quote', 'Buttons', 'FeatureGrid', 'ValueBand', 'BuildTimeline', 'PhotoCardRow', 'DawnHowToSteps',
  'PlanBand', 'PillarNav', 'IllustratedFeature', 'RolePicker', 'Manifesto', 'LeadFunnel', 'Showcase', 'Tiers',
  'SeasonTimeline', 'CircleFirstNight', 'RolesPath', 'QuestLoop', 'BackTheBuild', 'PhotoBeat', 'Marquee',
  'LiveStats', 'LivePosts',
  // The astrology calendar family draws itself in every theme (components/page-editor/blocks/wildheart.tsx).
  'WildheartYearJourney', 'WildheartSkyMap', 'WildheartNowLine',
  // The Wildheart composition blocks (LIVE-903) draw themselves the same way: ornament, photo frame, moon path
  // and strip, seal cards, season band, retreat band, mark split. Tokens only, so the other themes get them
  // in their own palette.
  'WildheartOrnament', 'WildheartPhoto', 'WildheartMoonPath', 'WildheartMoonStrip', 'WildheartSealCards',
  'WildheartSeasonBand', 'WildheartRetreatBand', 'WildheartMarkSplit', 'WildheartModules', 'WildheartFirstNight',
])

/** Home blocks that keep the Space page's own render (inside the house `.hs-plain` band). */
const HOME_OWN_RENDER = new Set([
  'about', 'story', 'booking', 'events', 'journeys', 'team', 'reviews', 'callout', 'gallery', 'embed', 'recording',
  'photoHero', 'displayHeading', 'prose',
])

const websitePageTypes = () => {
  const cats = config.categories as Record<string, { components?: string[] }>
  return [...new Set([...(categoryKeysForSurface('website') ?? [])].flatMap((k) => cats[k]?.components ?? []))]
}

describe('every core block has a render in both site themes', () => {
  it('plans every website page block to a section or a listed own render', () => {
    const unplanned = websitePageTypes().filter((type) => {
      const [plan] = planMensworkPage([{ type, props: {} }])
      return plan.kind === 'other' && !PAGE_OWN_RENDER.has(type)
    })
    expect(unplanned, 'give these a site page section, or list them in PAGE_OWN_RENDER').toEqual([])
  })

  it('keeps the own-render list honest (a block that gained a section leaves it)', () => {
    const sectioned = [...PAGE_OWN_RENDER].filter((type) => planMensworkPage([{ type, props: {} }])[0].kind !== 'other')
    expect(sectioned).toEqual([])
    const offered = new Set(websitePageTypes())
    expect([...PAGE_OWN_RENDER].filter((t) => !offered.has(t))).toEqual([])
  })

  it('plans every Space Home block to a house section or a listed own render', () => {
    const ids = profilePaletteForKind('space').map((b) => b.id)
    const plain = ids.filter((id) => {
      const plan = planHouseSections([{ id: 'r', cells: [[id]] }])
      return plan.length > 0 && plan.every((s) => s.kind === 'other') && !HOME_OWN_RENDER.has(id)
    })
    expect(plain, 'give these a house section, or list them in HOME_OWN_RENDER').toEqual([])
    const sectioned = [...HOME_OWN_RENDER].filter((id) => planHouseSections([{ id: 'r', cells: [[id]] }]).some((s) => s.kind !== 'other'))
    expect(sectioned).toEqual([])
  })

  it('draws a custom page through the same sections in either theme', () => {
    const page = readFileSync(resolve(process.cwd(), 'components/sites/site-page.tsx'), 'utf8')
    // The page doc is planned whatever the theme, and the Frequency sheet rides it when no Bold skin does.
    expect(page).toMatch(/const mwBlocks: MwBlock\[\] \| null =\s*customPage\s*\?/)
    expect(page).toMatch(/!skin && <style>\{FREQUENCY_PAGE_CSS\}<\/style>/)
  })
})

/** Every `.mw-*` class a stylesheet targets. */
const targeted = (css: string) => new Set(css.match(/\.mw-[a-z0-9-]+/g))

/** Every `mw-*` class the shared markup can draw: static class names and the template-literal stems. */
const drawn = () => {
  const src = ['components/sites/menswork-page.tsx', 'components/sites/menswork-live.tsx']
    .map((f) => readFileSync(resolve(process.cwd(), f), 'utf8'))
    .join('\n')
  const out = new Set<string>()
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    for (const c of raw.match(/mw-[a-z0-9-]*[a-z0-9]/g) ?? []) out.add(`.${c}`)
  }
  return out
}

/** Hooks a stylesheet needs not target: wrappers that only group, and the dynamic stems resolved above. */
const HOOK_ONLY = new Set(['.mw-beats-wrap', '.mw-finder-list', '.mw-parts', '.mw-head-title', '.mw-cols'])

describe('both site theme stylesheets dress the shared page sections', () => {
  it('styles every class the markup draws, in each theme', () => {
    const frequency = targeted(FREQUENCY_PAGE_CSS)
    const bold = targeted(MENSWORK_PAGE_CSS)
    const classes = [...drawn()].filter((c) => !HOOK_ONLY.has(c))
    expect(classes.filter((c) => !frequency.has(c)), 'missing from FREQUENCY_PAGE_CSS').toEqual([])
    expect(classes.filter((c) => !bold.has(c)), 'missing from MENSWORK_PAGE_CSS').toEqual([])
  })

  it('answers every class one theme styles in the other', () => {
    const frequency = targeted(FREQUENCY_PAGE_CSS)
    const bold = targeted(MENSWORK_PAGE_CSS)
    expect([...bold].filter((c) => !frequency.has(c)), 'Bold styles it, Frequency does not').toEqual([])
    expect([...frequency].filter((c) => !bold.has(c)), 'Frequency styles it, Bold does not').toEqual([])
  })

  it('scopes the Frequency sheet away from a Bold site, and reads tokens only', () => {
    const selectors = FREQUENCY_PAGE_CSS.replace(/\{[^}]*\}/g, '\n')
      .split('\n')
      .map((s) => s.replace(/^[\s}]+/, '').trim())
      .filter((s) => s && !s.startsWith('@media'))
    for (const sel of selectors) expect(sel, sel).toContain('[data-house-site]:not([data-house-theme="menswork"])')
    expect(FREQUENCY_PAGE_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(FREQUENCY_PAGE_CSS).not.toMatch(/rgba?\(/)
  })
})

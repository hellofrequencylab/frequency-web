import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MODULE_SECTION_ANCHORS,
  authoredHasContent,
  deriveModuleSectionNav,
  listGridBlockIds,
  moduleSectionRenders,
} from './module-section-nav'
import { PROFILE_BLOCKS } from './profile-blocks'
import { MAX_SECTION_ANCHORS, NO_PRESENCE, type SectionPresence } from './section-anchors'
import { hasContent } from '@/components/entity-blocks/content-block-view'
import type { RowDef } from '@/lib/entity-blocks/layout'

const row = (...stacks: string[][]): RowDef =>
  ({ id: `r${stacks.length}`, columns: stacks.length, cells: stacks }) as unknown as RowDef

const ALL_LIVE: SectionPresence = {
  booking: true,
  events: true,
  reviews: true,
  faqs: true,
  practices: true,
  circles: true,
  about: true,
  team: true,
  highlights: true,
}

/** Every anchor a space-profile block actually mounts, read from the component sources. This is the
 *  OTHER HALF of the comparison that was never made: the menu map and the renderer each looked
 *  right on their own, and `book` vs `booking` only shows up when you put them side by side. */
function renderedAnchors(): Set<string> {
  const dir = 'components/widgets/space-profile'
  const found = new Set<string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    const src = readFileSync(`${dir}/${file}`, 'utf8')
    for (const m of src.matchAll(/<ModuleSection\s+anchor="([a-z0-9-]+)"/g)) found.add(m[1])
  }
  return found
}

describe('the anchor map describes the page the module engine renders', () => {
  // 🔴 THE ROW ITSELF. This assertion fails on the map this file replaced, because it carried
  // `book` while booking.tsx mounts `<ModuleSection anchor="booking">`. Negative-controlled:
  // changing any anchor here to a near-miss fails by naming the anchor.
  it('every anchor the menu can emit is one a block really mounts', () => {
    const rendered = renderedAnchors()
    // Guard the guard: a scan that found nothing would pass this vacuously.
    expect(rendered.size).toBeGreaterThanOrEqual(12)
    for (const [id, meta] of Object.entries(MODULE_SECTION_ANCHORS)) {
      expect(rendered, `${id} -> #${meta.anchor} is not mounted by any space-profile block`).toContain(meta.anchor)
    }
  })

  it('`book` is not an anchor anything renders, which is what made the old map a dead link', () => {
    expect(renderedAnchors()).not.toContain('book')
  })

  it('the anchor IS the block id, because that is what <ModuleSection> is mounted with', () => {
    for (const [id, meta] of Object.entries(MODULE_SECTION_ANCHORS)) expect(meta.anchor).toBe(id)
  })

  // The SpaceFAQ / SpaceAbout gap, closed and held: the Puck map simply had no entry for either, so
  // a rendered FAQ could never be linked no matter how much content it held.
  // The SpaceFAQ / SpaceAbout gap, closed and held: the Puck map simply had no entry for either.
  // Exhaustiveness over the ProfileBlockId UNION is enforced by the Record<> type at compile time;
  // this asserts the runtime registry is covered too, and names the two that were missing.
  //
  // 🔎 FOUND WRITING THIS, NOT FIXED HERE: `faq` is in the ProfileBlockId union and IS rendered
  // (faq.tsx mounts #faq, and Royal Temple's saved layout carries a `faq` block), but it has NO row
  // in PROFILE_BLOCKS — so the block picker cannot offer it and no fresh default can include it.
  // That is why this is a subset check rather than an equality. Filed as its own row, not widened
  // into this one.
  it('covers every profile block, so no rendered section is unlinkable', () => {
    for (const b of PROFILE_BLOCKS) expect(Object.keys(MODULE_SECTION_ANCHORS), b.id).toContain(b.id)
    expect(Object.keys(MODULE_SECTION_ANCHORS)).toContain('faq')
    expect(Object.keys(MODULE_SECTION_ANCHORS)).toContain('about')
  })

  it('labels stay short nouns rather than the operator heading', () => {
    for (const meta of Object.values(MODULE_SECTION_ANCHORS)) {
      expect(meta.label.length).toBeLessThanOrEqual(12)
      expect(meta.label).not.toContain('—')
    }
  })
})

describe('authoredHasContent tracks the renderer it was copied from', () => {
  const cases: [string, Record<string, unknown> | undefined][] = [
    ['about', undefined],
    ['about', {}],
    ['about', { body: 'hello' }],
    ['divider', {}],
    ['divider', undefined],
    ['offerings', { items: [] }],
    ['gallery', { images: ['a'] }],
  ]
  it('agrees with hasContent on every input', () => {
    for (const [id, props] of cases) expect(authoredHasContent(id, props), `${id} ${JSON.stringify(props)}`).toBe(hasContent(id, props))
  })
})

describe('listGridBlockIds', () => {
  it('reads row by row, then column by column, then down each stack', () => {
    expect(listGridBlockIds([row(['about', 'story']), row(['events'], ['faq'])])).toEqual([
      'about',
      'story',
      'events',
      'faq',
    ])
  })

  it('is total against a malformed grid', () => {
    expect(listGridBlockIds(null)).toEqual([])
    expect(listGridBlockIds(undefined)).toEqual([])
    expect(listGridBlockIds([{ id: 'r', columns: 1 } as unknown as RowDef])).toEqual([])
    expect(listGridBlockIds([{ id: 'r', columns: 1, cells: [[42, 'faq']] } as unknown as RowDef])).toEqual(['faq'])
  })
})

describe('moduleSectionRenders', () => {
  it('judges a live block by the presence flag the body reads', () => {
    expect(moduleSectionRenders('events', { ...NO_PRESENCE, events: true }, undefined)).toBe(true)
    expect(moduleSectionRenders('events', NO_PRESENCE, undefined)).toBe(false)
    expect(moduleSectionRenders('faq', { ...NO_PRESENCE, faqs: true }, undefined)).toBe(true)
  })

  it('counts an authored body on a live block, because the block prefers it over the live data', () => {
    expect(moduleSectionRenders('about', NO_PRESENCE, { about: { body: 'Our story' } })).toBe(true)
  })

  it('judges an authored block by its own content bag', () => {
    expect(moduleSectionRenders('offerings', ALL_LIVE, undefined)).toBe(false)
    expect(moduleSectionRenders('offerings', NO_PRESENCE, { offerings: { items: [{ title: 'Reiki' }] } })).toBe(true)
  })

  it('never lists a design or content block, which mounts its own anchor and is not a section', () => {
    for (const id of ['editorial', 'gallery', 'zigzag', 'photoHero', 'accentBeat', 'callout', 'contactForm']) {
      expect(moduleSectionRenders(id, ALL_LIVE, { [id]: { anything: 1 } }), id).toBe(false)
    }
  })
})

describe('deriveModuleSectionNav', () => {
  it('lists only what the grid will draw, in the grid order', () => {
    const rows = [row(['events', 'offerings']), row(['faq'])]
    expect(deriveModuleSectionNav(rows, { ...NO_PRESENCE, events: true, faqs: true })).toEqual([
      { anchor: 'events', label: 'Events' },
      { anchor: 'faq', label: 'FAQ' },
    ])
  })

  it('dedupes and caps at MAX_SECTION_ANCHORS', () => {
    const rows = [row(['events', 'events', 'faq', 'about', 'team', 'highlights', 'booking', 'practices', 'circles'])]
    const nav = deriveModuleSectionNav(rows, ALL_LIVE)
    expect(nav.length).toBe(MAX_SECTION_ANCHORS)
    expect(new Set(nav.map((n) => n.anchor)).size).toBe(nav.length)
  })

  it('is empty rather than wrong for a Space with nothing on its page', () => {
    expect(deriveModuleSectionNav([row(['events', 'faq', 'team'])], NO_PRESENCE)).toEqual([])
    expect(deriveModuleSectionNav(null, ALL_LIVE)).toEqual([])
  })

  // Royal Temple's real saved layout, in its stored order (13 rows, read from production
  // 2026-09-27). The menu it was being given came from the SEEDED DEFAULT doc instead —
  // offerings / booking / practices, none of which are on this page.
  it('gives Royal Temple a menu made of its own page', () => {
    const rt = [
      row(['editorial']),
      row(['features']),
      row(['gallery']),
      row(['contactForm']),
      row(['events']),
      row(['zigzag']),
      row(['cardGrid']),
      row(['photoHero']),
      row(['circles']),
      row(['accentBeat']),
      row(['callout']),
      row(['faq']),
      row(['contact', 'business']),
    ]
    const nav = deriveModuleSectionNav(rt, { ...NO_PRESENCE, events: true, circles: true, faqs: true }, {
      business: { links: ['x'] },
    })
    expect(nav.map((n) => n.anchor)).toEqual(['events', 'circles', 'faq', 'business'])
    // Nothing from the seeded default that this Space never placed.
    expect(nav.map((n) => n.anchor)).not.toContain('offerings')
    expect(nav.map((n) => n.anchor)).not.toContain('booking')
    expect(nav.map((n) => n.anchor)).not.toContain('practices')
  })
})

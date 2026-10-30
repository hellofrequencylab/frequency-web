import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { nextSpotlightPreferences, readSpaceSpotlight, SPACE_SPOTLIGHT_BLOCK_IDS } from '@/lib/spaces/spotlight'
import { validWebsiteSnapshot, WEBSITE_THEMES_LIVE } from '@/lib/sites/editor/state'
import { FREE_HUMAN_MENU, FREE_HUMAN_PROGRAMS, FREE_HUMAN_SPACE, FREE_HUMAN_SPOTLIGHT_BLOCKS, freeHumanEditorState, freeHumanSpotlight } from './free-human-site'
import { FREE_HUMAN_SEED_EVENTS } from './free-human-seed-events'

describe('the Free Human Movement Space', () => {
  const state = freeHumanEditorState('2026-10-29T00:00:00.000Z')

  it('publishes a valid Free Human website with a home, the menu pages and a calendar, every block registered', () => {
    expect(state.published && validWebsiteSnapshot(state.published)).toBe(true)
    expect(state.published!.theme).toBe('FreeHuman')
    expect(WEBSITE_THEMES_LIVE.has('FreeHuman')).toBe(true)
    expect(state.published!.pages.map((p) => p.slug)).toEqual(['home', 'program', 'workshops', 'books', 'audrey', 'calendar'])
    for (const p of state.published!.pages) for (const b of p.doc.content) expect(config.components[b.type as string], b.type as string).toBeTruthy()
    expect(FREE_HUMAN_MENU.known).toEqual(state.published!.pages.map((p) => `page:${p.slug}`))
  })

  it('has no button that goes to a page the site does not have', () => {
    const text = JSON.stringify(state.published!.pages)
    const pages = new Set(state.published!.pages.map((p) => p.slug))
    for (const m of text.matchAll(/"~\/([a-z-]+)"/g)) expect(pages.has(m[1]!), m[1]).toBe(true)
    expect(text).not.toContain('"~/shop"')
    expect(text).toContain('"~/calendar"')
  })

  it('gives every block a stable id', () => {
    const ids = state.published!.pages.flatMap((p) => p.doc.content.map((b) => (b.props as { id: string }).id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('fh-'))).toBe(true)
  })

  it('publishes a full Space Spotlight: every block is a Spotlight block, and its words and photos survive the Space write guard', () => {
    for (const id of FREE_HUMAN_SPOTLIGHT_BLOCKS) expect(SPACE_SPOTLIGHT_BLOCK_IDS as readonly string[]).toContain(id)
    expect(FREE_HUMAN_SPOTLIGHT_BLOCKS.length).toBeLessThanOrEqual(12)
    const stored = nextSpotlightPreferences({}, { published: true, layout: freeHumanSpotlight().layout })
    const spotlight = readSpaceSpotlight(stored)
    expect(spotlight.published).toBe(true)
    expect(spotlight.layout?.rows?.map((r) => r.cells[0][0])).toEqual([...FREE_HUMAN_SPOTLIGHT_BLOCKS])
    const content = spotlight.layout?.content as Record<string, Record<string, unknown>>
    expect(content.image.src).toMatch(/^\/sites\/free-human\/photos\//)
    expect(content.button.label).toBe('Join the circle')
    expect(content.text.text).toMatch(/^Softness/)
    expect((content.links.items as unknown[]).length).toBe(5)
    expect(content.contactForm.title).toBe('Say hello')
  })

  it("leaves the data blocks to read the Space: no copy of the about text or the events in the Spotlight", () => {
    const content = freeHumanSpotlight().layout.content
    expect(content.about).not.toHaveProperty('body')
    expect(content.events).not.toHaveProperty('items')
    expect(content.linkCards).not.toHaveProperty('items')
  })

  it("seeds the design's year: 26 gatherings with one weekly anchor, four seasons, a cover and a mark", () => {
    expect(FREE_HUMAN_SEED_EVENTS).toHaveLength(26)
    expect(new Set(FREE_HUMAN_SEED_EVENTS.map((e) => e.id)).size).toBe(26)
    expect(FREE_HUMAN_SEED_EVENTS.filter((e) => e.recurrence === 'weekly')).toHaveLength(1)
    expect(FREE_HUMAN_SEED_EVENTS.every((e) => e.startsAt < e.endsAt && !/\$\d/.test(e.summary))).toBe(true)
    expect(FREE_HUMAN_PROGRAMS.map((p) => p.name)).toEqual(['Rest', 'Embody', 'Create', 'Raise'])
    expect(FREE_HUMAN_SPACE.cover).toMatch(/\.webp$/)
    expect(FREE_HUMAN_SPACE.logo).toMatch(/\.svg$/)
  })
})

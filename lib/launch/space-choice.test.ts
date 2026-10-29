import { describe, expect, it } from 'vitest'
import { mergeSpotlightLayout, publishedSpotlightPreferences } from './spotlight-step'
import { NEW_SPACE, parseSpaceChoice, spaceChoices, type OwnedSpace } from './space-choice'

const spaces: OwnedSpace[] = [
  { id: 'a', slug: 'rageher', name: 'RAGEher', spotlightLive: false },
  { id: 'b', slug: 'danieltyack', name: 'Daniel Tyack', spotlightLive: true },
]

describe('which Space the launch is for', () => {
  it('lists the Spaces with a live Spotlight first and ends with a new one', () => {
    const c = spaceChoices(spaces)
    expect(c.map((x) => x.value)).toEqual(['b', 'a', NEW_SPACE])
    expect(c[0].note).toBe('Spotlight is live')
    expect(c[1].note).toBe('No Spotlight yet')
  })
  it('only accepts one of the person’s own Spaces, or a new one', () => {
    expect(parseSpaceChoice('b', spaces)).toEqual(spaces[1])
    expect(parseSpaceChoice('someone-elses', spaces)).toBeNull()
    expect(parseSpaceChoice(NEW_SPACE, spaces)).toBe(NEW_SPACE)
    expect(parseSpaceChoice(null, spaces)).toBeNull()
  })
})

describe('a Spotlight that already exists keeps its blocks', () => {
  const existing = {
    rows: [{ id: 'r0', columns: 1, cells: [['about']] }, { id: 'r1', columns: 1, cells: [['contactForm']] }, { id: 'r3', columns: 1, cells: [['links']] }],
    content: { links: { items: [{ label: 'kept', url: 'https://kept.example.com/' }] } },
  }
  const answers = { name: 'Daniel Tyack', line: 'I get people together.', link: 'https://example.com/book' }
  it('adds the typed words in front and removes nothing', () => {
    const merged = mergeSpotlightLayout(existing, answers) as { rows: { cells: string[][] }[]; content: Record<string, { text?: string; items?: unknown[] }> }
    const ids = merged.rows.flatMap((r) => r.cells.flat())
    expect(ids).toEqual(['heading', 'text', 'about', 'contactForm', 'links'])
    expect(merged.content.heading.text).toBe('Daniel Tyack')
    expect(merged.content.text.text).toBe('I get people together.')
  })
  it('does not replace links they already have', () => {
    const merged = mergeSpotlightLayout(existing, answers) as { content: { links: { items: { url: string }[] } } }
    expect(merged.content.links.items).toHaveLength(1)
    expect(merged.content.links.items[0].url).toBe('https://kept.example.com/')
  })
  it('keeps the arranged blocks when the preferences are written', () => {
    const prefs = publishedSpotlightPreferences({ spotlight: { published: true, layout: existing }, other: 1 }, answers) as { other: number; spotlight: { layout: { rows: unknown[] } } }
    expect(prefs.other).toBe(1)
    expect(prefs.spotlight.layout.rows.length).toBe(5)
  })
  it('starts a fresh layout when there is none', () => {
    const prefs = publishedSpotlightPreferences({}, answers) as { spotlight: { layout: { rows: unknown[] } } }
    expect(prefs.spotlight.layout.rows.length).toBe(3)
  })
})

import { describe, expect, it } from 'vitest'
import { overviewHeadingId, readOverviewDoc, safeOverviewHref } from './leadership-overview'

// LIVE-864: the overview Markdown read into the design system template's parts, by shape.

const MD = `_Master overview, Oct 7, 2026. Daniel Tyack._

## What Hearts on Fire is

Hearts on Fire is a year-round program.

It has four parts.

- **The circles.** Groups of 6 to 12 men.
- **The opening course.** Eight weekly sessions.

> The program grows by adding circles.

## The member path

Enrollment opens once a year.

1. **Visit.** Come to one Circle Night.
2. ***Do the opening course.*** Every member completes it.

_The opening course is documented separately._

## The meeting framework

| Beat | Purpose |
| --- | --- |
| Presence | Arrive. |
| Unite | Check in. |

### Fixed in every circle

- The five beats.

### Flexible by circle

- Venue.

## Master curriculum

| Season | Sign | Starts | Theme |
| --- | --- | --- | --- |
| Winter: Stillness | Capricorn | Dec 21 | Structure |
| | Aquarius | Jan 19 | Brotherhood |

## Starting a circle

| Path | Who | What |
| --- | --- | --- |
| Start new | A member | Opens a subcircle |

**Growth rule.** A circle holds 6 to 12 men.

## Shared events

![Fire](https://x.test/a.jpg?pos=50-72) ![Talk](https://x.test/b.jpg)

| Level | Event | Rhythm |
| --- | --- | --- |
| All circles | Desert Retreat | Oct 29 to 31 |

[See the 2027 calendar →](/admin/calendar)

## Why

| Design choice | What the research says |
| --- | --- |
| Small circles | Trust. |
| A | B |
| C | D |
| E | F |
| G | H |

### Limits

The evidence has limits.

## Open decisions

| Decision | Status |
| --- | --- |
| Money | TBD: price. |

## Sources

1. University of Iowa
2. ManKind Project
`

describe('readOverviewDoc', () => {
  const doc = readOverviewDoc(MD)
  const kinds = (i: number) => doc.sections[i].blocks.map((b) => (b.kind === 'table' ? `table:${b.variant}` : b.kind))

  it('reads the meta line and one section per heading', () => {
    expect(doc.meta).toEqual({ label: 'Master overview', line: 'Oct 7, 2026 · Daniel Tyack' })
    expect(doc.preamble).toEqual([])
    expect(doc.sections.map((s) => s.title)).toHaveLength(9)
    expect(doc.sections[0].id).toBe('what-hearts-on-fire-is')
  })

  it('gives each shape its part', () => {
    expect(kinds(0)).toEqual(['lede', 'para', 'parts', 'pull'])
    expect(kinds(1)).toEqual(['lede', 'path', 'note'])
    expect(kinds(2)).toEqual(['table:beats', 'pairs'])
    expect(kinds(3)).toEqual(['table:seasons'])
    expect(kinds(4)).toEqual(['table:cards', 'callout'])
    expect(kinds(5)).toEqual(['photos', 'table:levels', 'link'])
    expect(kinds(6)).toEqual(['table:plain', 'aside'])
    expect(kinds(7)).toEqual(['table:decisions'])
    expect(kinds(8)).toEqual(['numbered'])
  })

  it('keeps the details each part needs', () => {
    const path = doc.sections[1].blocks[1]
    expect(path).toEqual({
      kind: 'path',
      items: [
        { title: 'Visit', text: 'Come to one Circle Night.', current: false },
        { title: 'Do the opening course', text: 'Every member completes it.', current: true },
      ],
    })
    const pairs = doc.sections[2].blocks[1]
    expect(pairs.kind === 'pairs' && pairs.groups.map((g) => g.label)).toEqual(['Fixed in every circle', 'Flexible by circle'])
    expect(doc.sections[4].blocks[1]).toEqual({ kind: 'callout', label: 'Growth rule.', text: 'A circle holds 6 to 12 men.' })
    const photos = doc.sections[5].blocks[0]
    expect(photos.kind === 'photos' && photos.images.map((i) => i.alt)).toEqual(['Fire', 'Talk'])
    expect(doc.sections[5].blocks[2]).toEqual({ kind: 'link', text: 'See the 2027 calendar →', href: '/admin/calendar' })
  })

  it('reads an empty overview as nothing', () => {
    expect(readOverviewDoc('')).toEqual({ meta: null, preamble: [], sections: [] })
  })
})

describe('overview links and anchors', () => {
  it('allows only site paths, anchors and web or mail addresses', () => {
    expect(safeOverviewHref('/admin/calendar')).toBe('/admin/calendar')
    expect(safeOverviewHref('#sources')).toBe('#sources')
    expect(safeOverviewHref('https://x.test')).toBe('https://x.test')
    expect(safeOverviewHref('javascript:alert(1)')).toBeNull()
    expect(safeOverviewHref('//evil.test')).toBeNull()
  })

  it('makes an anchor from the plain heading', () => {
    expect(overviewHeadingId("The member's **path**")).toBe('the-members-path')
  })
})

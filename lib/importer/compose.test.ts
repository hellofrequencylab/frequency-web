import { describe, it, expect } from 'vitest'
import { planToLayout, reseedBlockCopy, type ComposedSection } from './compose'
import type { BusinessProfile } from './schema'
import type { EntityLayout } from '@/lib/entity-blocks/layout'

// planToLayout is the PURE core of the AI composer: it turns the model's chosen SECTIONS into a safe
// EntityLayout of titled rows. The model call is untestable in CI; this locks the block allowlist, the
// per-block bags, image-by-index resolution, the section grouping (title -> row header, columns pairing),
// the "each block once / drop-empty / too-thin" rules, and the guaranteed Contact + Business close.

const profile: BusinessProfile = { name: 'Vista Retreat', type: 'business', tagline: 'Rest here' }
const gallery = ['https://cdn.example/g0.jpg', 'https://cdn.example/g1.jpg']

function ids(layout: EntityLayout | null): string[] {
  return (layout?.rows ?? []).flatMap((r) => r.cells.flat())
}

describe('planToLayout builds a safe, sectioned marketing layout', () => {
  it('names each section as a row header, drops unknown blocks (and the never-seeded photoHero)', () => {
    const sections: ComposedSection[] = [
      { title: 'Our place', blocks: [{ block: 'zigzag', title: 'A calm room', body: 'A calm room.', imageIndex: 1 }] },
      { title: 'Nope', blocks: [{ block: 'photoHero', title: 'Vista Retreat', imageIndex: 0 }, { block: 'nonsense' }] },
      { title: 'What we offer', blocks: [{ block: 'cardGrid', title: 'Rooms', cards: [{ title: 'Room', text: 'A room' }] }] },
    ]
    const layout = planToLayout(sections, profile, gallery)!
    // Unknown + photoHero drop; the middle section then has no blocks, so it contributes no row/header.
    // Contact + Business are guaranteed to close the page.
    expect(ids(layout)).toEqual(['zigzag', 'cardGrid', 'contact', 'business'])
    // A section title becomes the row's live header.
    const zigRow = layout.rows!.find((r) => r.cells.flat().includes('zigzag'))!
    expect(zigRow.title).toBe('Our place')
    expect(zigRow.headerOn).toBe(true)
    // zigzag resolves its image by index (the second gallery photo).
    expect(layout.content?.zigzag).toMatchObject({ title: 'A calm room', body: 'A calm room.', image: 'https://cdn.example/g1.jpg' })
    expect(layout.content?.cardGrid).toMatchObject({ cards: [{ icon: '', title: 'Room', text: 'A room' }] })
  })

  it('pairs two blocks into a 2-column row when the section asks for columns', () => {
    const layout = planToLayout(
      [{ title: 'Plan a visit', columns: 2, blocks: [{ block: 'offerings' }, { block: 'booking' }] }],
      profile,
      gallery,
    )!
    const row = layout.rows!.find((r) => r.columns === 2)!
    expect(row.cells).toEqual([['offerings'], ['booking']])
    expect(row.title).toBe('Plan a visit')
  })

  it('downgrades a 2-column section to one column when only one block survives', () => {
    const layout = planToLayout(
      [
        { title: 'Solo', columns: 2, blocks: [{ block: 'about' }] },
        { title: 'More', blocks: [{ block: 'story' }] },
      ],
      profile,
      gallery,
    )!
    const row = layout.rows!.find((r) => r.cells.flat().includes('about'))!
    expect(row.columns).toBe(1)
    expect(row.cells).toEqual([['about']])
  })

  it('places each block at most once across sections (first wins)', () => {
    const layout = planToLayout(
      [
        { title: 'One', blocks: [{ block: 'prose', body: 'First.' }] },
        { title: 'Two', blocks: [{ block: 'prose', body: 'Second.' }, { block: 'contact' }] },
      ],
      profile,
      gallery,
    )!
    expect(ids(layout).filter((b) => b === 'prose')).toHaveLength(1)
    expect(layout.content?.prose).toEqual({ text: 'First.' })
  })

  it('drops an authored block with no usable copy', () => {
    const layout = planToLayout(
      [{ title: 'Intro', blocks: [{ block: 'editorial' }, { block: 'about' }, { block: 'story' }] }],
      profile,
      gallery,
    )!
    expect(ids(layout)).not.toContain('editorial')
    expect(ids(layout)).toContain('about')
  })

  it('resolves cards + strips em dashes from generated copy', () => {
    const layout = planToLayout(
      [
        { title: 'Why us', blocks: [{ block: 'features', cards: [{ title: 'Calm', text: 'A quiet room — always' }, { title: '', text: '' }] }] },
        { title: 'About', blocks: [{ block: 'about' }] },
      ],
      profile,
      gallery,
    )!
    // Empty card dropped; em dash stripped (" — " becomes ", ").
    expect(layout.content?.features).toEqual({ items: [{ icon: '', title: 'Calm', text: 'A quiet room, always' }] })
  })

  it('always closes with Contact + Business, and pairs them when both are missing', () => {
    const layout = planToLayout(
      [{ title: 'About', blocks: [{ block: 'about' }, { block: 'story' }] }],
      profile,
      gallery,
    )!
    expect(ids(layout)).toContain('contact')
    expect(ids(layout)).toContain('business')
    const findUs = layout.rows!.find((r) => r.title === 'Find us')!
    expect(findUs.columns).toBe(2)
    expect(findUs.cells).toEqual([['contact'], ['business']])
  })

  it('does not re-append a core block the model already placed', () => {
    const layout = planToLayout(
      [
        { title: 'About', blocks: [{ block: 'about' }] },
        { title: 'Reach us', blocks: [{ block: 'contact' }, { block: 'business' }] },
      ],
      profile,
      gallery,
    )!
    expect(ids(layout).filter((b) => b === 'contact')).toHaveLength(1)
    expect(ids(layout).filter((b) => b === 'business')).toHaveLength(1)
    // No extra "Find us" row was appended.
    expect(layout.rows!.some((r) => r.title === 'Find us')).toBe(false)
  })

  it('ignores an out-of-range imageIndex', () => {
    const layout = planToLayout(
      [
        { title: 'Beat', blocks: [{ block: 'zigzag', body: 'A beat.', imageIndex: 9 }] },
        { title: 'About', blocks: [{ block: 'about' }] },
      ],
      profile,
      gallery,
    )!
    expect(layout.content?.zigzag).toEqual({ body: 'A beat.' }) // no image key
  })

  it('returns null when the model places fewer than two real blocks (keep the deterministic layout)', () => {
    // The single authored block is dropped for empty copy, so the model placed nothing: too thin to
    // override, regardless of the guaranteed core (which only tops up a real page).
    expect(planToLayout([{ blocks: [{ block: 'editorial' }] }], profile, gallery)).toBeNull()
    expect(planToLayout([{ blocks: [{ block: 'contact' }] }], profile, gallery)).toBeNull()
  })
})

describe('reseedBlockCopy pre-AI guards (task #17)', () => {
  // The AI call itself is untestable in CI (like composeMarketingLayout); these lock the deterministic
  // guards that short-circuit BEFORE any model call, so a block with nothing to rewrite never spends budget.
  it('returns null for a block with no text fields to rewrite', async () => {
    expect(await reseedBlockCopy('divider', profile, {})).toBeNull()
    expect(await reseedBlockCopy('gallery', profile, {})).toBeNull()
  })
  it('returns null when the master profile has no name to ground on', async () => {
    expect(await reseedBlockCopy('editorial', { name: '', type: 'business' } as BusinessProfile, {})).toBeNull()
  })
})

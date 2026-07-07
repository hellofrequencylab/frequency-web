import { describe, it, expect } from 'vitest'
import { planToLayout, type ComposedSection } from './compose'
import type { BusinessProfile } from './schema'

// planToLayout is the PURE core of the AI composer: it turns the model's chosen sections into a safe
// EntityLayout. The model call is untestable in CI; this locks the block allowlist, the per-block bags,
// image-by-index resolution, and the "each block once / drop-empty / too-thin" rules.

const profile: BusinessProfile = { name: 'Vista Retreat', type: 'business', tagline: 'Rest here' }
const gallery = ['https://cdn.example/g0.jpg', 'https://cdn.example/g1.jpg']

function ids(layout: { rows: { cells: string[][][] }[] } | null): string[] {
  return (layout?.rows ?? []).flatMap((r) => r.cells.flat())
}

describe('planToLayout builds a safe marketing layout', () => {
  it('keeps known blocks in order, drops unknown ones', () => {
    const sections: ComposedSection[] = [
      { block: 'photoHero', title: 'Vista Retreat', imageIndex: 1 },
      { block: 'nonsense', title: 'x' },
      { block: 'cardGrid', title: 'What we offer', cards: [{ title: 'Room', text: 'A room' }] },
      { block: 'contact' },
    ]
    const layout = planToLayout(sections, profile, gallery)!
    expect(ids(layout)).toEqual(['photoHero', 'cardGrid', 'contact'])
    // photoHero uses the image by index (the second gallery photo), never the cover.
    expect(layout.content?.photoHero).toMatchObject({ title: 'Vista Retreat', image: 'https://cdn.example/g1.jpg' })
    expect(layout.content?.cardGrid).toMatchObject({ cards: [{ icon: '', title: 'Room', text: 'A room' }] })
  })

  it('places each block at most once (first wins)', () => {
    const layout = planToLayout(
      [
        { block: 'prose', body: 'First.' },
        { block: 'prose', body: 'Second.' },
        { block: 'contact' },
      ],
      profile,
      gallery,
    )!
    expect(ids(layout).filter((b) => b === 'prose')).toHaveLength(1)
    expect(layout.content?.prose).toEqual({ text: 'First.' })
  })

  it('drops an authored block with no usable copy', () => {
    const layout = planToLayout(
      [
        { block: 'editorial' }, // no body → dropped
        { block: 'about' },
        { block: 'contact' },
      ],
      profile,
      gallery,
    )!
    expect(ids(layout)).not.toContain('editorial')
    expect(ids(layout)).toContain('contact')
  })

  it('resolves cards + strips em dashes from generated copy', () => {
    const layout = planToLayout(
      [
        { block: 'features', cards: [{ title: 'Calm', text: 'A quiet room — always' }, { title: '', text: '' }] },
        { block: 'contact' },
      ],
      profile,
      gallery,
    )!
    // Empty card dropped; em dash stripped (" — " becomes ", ").
    expect(layout.content?.features).toEqual({ items: [{ icon: '', title: 'Calm', text: 'A quiet room, always' }] })
  })

  it('returns null when fewer than two blocks survive (keep the deterministic layout)', () => {
    expect(planToLayout([{ block: 'contact' }], profile, gallery)).toBeNull()
    expect(planToLayout([{ block: 'editorial' }], profile, gallery)).toBeNull() // dropped → 0
  })

  it('ignores an out-of-range imageIndex', () => {
    const layout = planToLayout(
      [
        { block: 'zigzag', body: 'A beat.', imageIndex: 9 },
        { block: 'contact' },
      ],
      profile,
      gallery,
    )!
    expect(layout.content?.zigzag).toEqual({ body: 'A beat.' }) // no image key
  })
})

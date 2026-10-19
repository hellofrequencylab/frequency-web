import { describe, it, expect } from 'vitest'
import { DATA_BLOCK_LIMIT, DESIGN_BLOCK_LIMIT, entityBlockLimit, typeLimiter } from './block-limits'
import { DESIGN_ENTITY_BLOCK_IDS, ENTITY_BLOCKS } from './registry'
import { mergeEntityLayout, parseEntityLayout, resolveRows, sanitizeEntityLayout, type RowDef } from './layout'
import { normalize } from './rows-ops'

// E0 task 10 (docs/EDITOR-E0.md §1.3, §8): "two `text` blocks coexist; two `offerings` refused". The
// gate is proven at EVERY former dedupe site, because §1.1's lesson is that the invariant was enforced
// six times and fixing one did nothing. A seventh site would be a `seen` set this file does not reach.

const row = (id: string, columns: 1 | 2 | 3 | 4, cells: string[][]): RowDef => ({ id, columns, cells })

describe('entityBlockLimit', () => {
  it('caps every data block at one, every design block at three, and nothing else', () => {
    for (const block of ENTITY_BLOCKS) {
      const expected = DESIGN_ENTITY_BLOCK_IDS.includes(block.id)
        ? DESIGN_BLOCK_LIMIT
        : block.category === 'data'
          ? DATA_BLOCK_LIMIT
          : null
      expect(entityBlockLimit(block.id), block.id).toBe(expected)
    }
    expect(entityBlockLimit('not-a-block')).toBeNull()
  })

  it('reads the design set from the registry, so a design block cannot be capped at one by accident', () => {
    for (const id of DESIGN_ENTITY_BLOCK_IDS) expect(entityBlockLimit(id), id).toBe(DESIGN_BLOCK_LIMIT)
    expect(DATA_BLOCK_LIMIT).toBe(1)
    expect(DESIGN_BLOCK_LIMIT).toBe(3)
  })
})

describe('typeLimiter', () => {
  it('admits a data block once, a design block three times, a content block without end', () => {
    const admit = typeLimiter()
    expect([admit('offerings'), admit('offerings')]).toEqual([true, false])
    expect([admit('zigzag'), admit('zigzag'), admit('zigzag'), admit('zigzag')]).toEqual([true, true, true, false])
    expect(Array.from({ length: 20 }, () => admit('text')).every(Boolean)).toBe(true)
  })

  it('counts per type, not across types, and each limiter starts fresh', () => {
    const admit = typeLimiter()
    expect(admit('about')).toBe(true)
    expect(admit('events')).toBe(true)
    expect(admit('about')).toBe(false)
    expect(typeLimiter()('about')).toBe(true)
  })
})

describe('the six former dedupe sites all read the one policy', () => {
  const twoTextTwoOfferings = [
    row('r0', 1, [['text']]),
    row('r1', 2, [['text'], ['offerings']]),
    row('r2', 1, [['offerings']]),
  ]

  it('parseRows (parseEntityLayout)', () => {
    const parsed = parseEntityLayout({ rows: twoTextTwoOfferings })
    expect(parsed?.rows?.map((r) => r.cells)).toEqual([[['text']], [['text'], ['offerings']], [[]]])
  })

  it('sanitizeRows + sanitizeEntityLayout (the write guard, rows and slots)', () => {
    const clean = sanitizeEntityLayout({ rows: twoTextTwoOfferings }, 'space')
    expect(clean?.rows?.map((r) => r.cells)).toEqual([[['text']], [['text'], ['offerings']], [[]]])
    const slots = sanitizeEntityLayout(
      { template: 'main-side', slots: { main: ['text', 'offerings'], side: ['text', 'offerings'] } },
      'space',
    )
    expect(slots?.slots).toEqual({ main: ['text', 'offerings'], side: ['text'] })
  })

  it('mergeEntityLayout (the legacy slot merge) admits by cap and appends a default only when its type is absent', () => {
    const merged = mergeEntityLayout(
      ['about', 'text'],
      { template: 'main-side', slots: { main: ['text', 'about'], side: ['text', 'about'] } },
      'space',
    )
    // Two text blocks survive; the second `about` is refused; neither default is appended again.
    expect(merged.slots).toEqual({ main: ['text', 'about'], side: ['text'] })
    const fresh = mergeEntityLayout(['about', 'text'], { template: 'main-side', slots: { main: ['text'] } }, 'space')
    expect(fresh.slots).toEqual({ main: ['text', 'about'] })
  })

  it('resolveRows (the render path)', () => {
    const rows = resolveRows({ rows: twoTextTwoOfferings }, 'space')
    expect(rows.map((r) => r.cells)).toEqual([[['text']], [['text'], ['offerings']], [[]]])
  })

  it('normalize (every builder mutation)', () => {
    const out = normalize({ rows: twoTextTwoOfferings, hidden: [] })
    expect(out.rows.map((r) => r.cells)).toEqual([[['text']], [['text'], ['offerings']], [[]]])
  })

  it('a design block stops at three on the write guard and the render path alike', () => {
    const four = [row('r0', 1, [['photoHero', 'photoHero', 'photoHero', 'photoHero']])]
    expect(sanitizeEntityLayout({ rows: four }, 'space')?.rows?.[0].cells).toEqual([['photoHero', 'photoHero', 'photoHero']])
    expect(resolveRows({ rows: four }, 'space')[0].cells).toEqual([['photoHero', 'photoHero', 'photoHero']])
  })
})

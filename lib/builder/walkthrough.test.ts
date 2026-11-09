import { describe, expect, it } from 'vitest'
import { readWalkthrough, walkthroughVerdict, type WalkthroughSession } from './walkthrough'

const session = (owner: string, over: Partial<WalkthroughSession> = {}): WalkthroughSession => ({ owner, published: true, helped: false, used: [{ id: 'hero.title', layer: 1 }], searched: [], notes: [], ...over })
const five = (over: (i: number) => Partial<WalkthroughSession> = () => ({})) => ['A', 'B', 'C', 'D', 'E'].map((o, i) => session(o, over(i)))

describe('the owner walk-through verdict (BLD-902)', () => {
  it('passes when five owners publish without help and no control is searched for by more than two', () => {
    const v = walkthroughVerdict(five((i) => ({ searched: i < 2 ? ['theme'] : [] })))
    expect(v.passes).toBe(true)
    expect(v.everyonePublishedUnaided).toBe(true)
    expect(v.hardToFind).toEqual([])
  })

  it('does not pass with fewer than five owners, a helped owner, or an owner who did not publish', () => {
    expect(walkthroughVerdict(five().slice(0, 4)).missing[0]).toContain('4 of 5 owners')
    const helped = walkthroughVerdict(five((i) => (i === 1 ? { helped: true } : {})))
    expect(helped.blocked).toEqual(['B'])
    expect(helped.passes).toBe(false)
    expect(walkthroughVerdict(five((i) => (i === 3 ? { published: false } : {}))).blocked).toEqual(['D'])
  })

  it('flags a control searched for in ⌘K by three owners, and not by two', () => {
    const three = walkthroughVerdict(five((i) => ({ searched: i < 3 ? ['theme'] : [] })))
    expect(three.hardToFind).toEqual([{ id: 'theme', owners: ['A', 'B', 'C'] }])
    expect(three.passes).toBe(false)
    expect(walkthroughVerdict(five((i) => ({ searched: i < 2 ? ['theme'] : [] }))).hardToFind).toEqual([])
  })

  it('promotes a Layer 2 control used by three of five owners, and never a Layer 1 one', () => {
    const v = walkthroughVerdict(five((i) => ({ used: [{ id: 'hero.title', layer: 1 }, ...(i < 3 ? [{ id: 'gatherings.variant', layer: 2 as const }] : []), ...(i === 4 ? [{ id: 'cta.tone', layer: 2 as const }] : [])] })))
    expect(v.promote).toEqual([{ id: 'gatherings.variant', owners: ['A', 'B', 'C'] }])
  })

  it('counts an owner once, and refuses a log twice for the same owner', () => {
    const v = walkthroughVerdict([...five(), session('A')])
    expect(v.passes).toBe(false)
    expect(v.missing.join(' ')).toContain('logged twice')
  })

  it('reads a log only in its expected shape', () => {
    expect(readWalkthrough({ sessions: five() })).toHaveLength(5)
    expect(readWalkthrough(five())).toHaveLength(5)
    expect(readWalkthrough({ sessions: [{ owner: 'A' }] })).toBeNull()
    expect(readWalkthrough('nope')).toBeNull()
    expect(readWalkthrough({ sessions: [{ ...session('A'), used: [{ id: 'x', layer: 3 }] }] })).toBeNull()
  })
})

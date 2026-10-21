import { describe, expect, it } from 'vitest'
import { ladderRungs } from './plan-ladder'

const sellable = { business: true, collective: true, network: true }
const RUNGS = [
  { plan: 'business', icon: 'business', blurb: '' },
  { plan: 'collective', icon: 'collective', blurb: '' },
  { plan: 'network', icon: 'network', blurb: '' },
] as unknown as Parameters<typeof ladderRungs>[0]

const chooseOf = (rows: ReturnType<typeof ladderRungs>) => rows.map((r) => r.choose)

describe('ladderRungs: a paid plan set by hand', () => {
  it('offers Choose on its own rung only, so it can start the subscription it lacks', () => {
    expect(chooseOf(ladderRungs(RUNGS, 'network', sellable, false, true, 'network'))).toEqual([null, null, 'network'])
  })
  it('offers nothing to a paid Space that already has a subscription', () => {
    expect(chooseOf(ladderRungs(RUNGS, 'network', sellable, false, true, null))).toEqual([null, null, null])
  })
  it('still offers every sellable rung to a free Space', () => {
    expect(chooseOf(ladderRungs(RUNGS, 'free', sellable, true, true, null))).toEqual(['business', 'collective', 'network'])
  })
})

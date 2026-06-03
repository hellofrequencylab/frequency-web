import { describe, it, expect } from 'vitest'
import { synthesizeInsights, summarize, type ReadInput } from './engagement-read'

const base: ReadInput = {
  wam: 5,
  newMembers: 10,
  activationRate: 0.6,
  funnel: [],
  challenges: [],
  quests: [],
}

describe('synthesizeInsights', () => {
  it('flags low activation as a risk', () => {
    const out = synthesizeInsights({ ...base, activationRate: 0.1 })
    const i = out.find((x) => x.id === 'activation_low')
    expect(i?.severity).toBe('risk')
    expect(i?.finding).toContain('10%')
  })

  it('celebrates healthy activation', () => {
    expect(synthesizeInsights(base).find((x) => x.id === 'activation_good')?.severity).toBe('good')
  })

  it('flags zero WAM', () => {
    expect(synthesizeInsights({ ...base, wam: 0 }).some((x) => x.id === 'wam_zero')).toBe(true)
  })

  it('flags the biggest funnel jam (>=40%)', () => {
    const out = synthesizeInsights({
      ...base,
      funnel: [
        { step: 'Viewed', actors: 100, dropPct: null },
        { step: 'Used a feature', actors: 30, dropPct: 70 },
      ],
    })
    const jam = out.find((x) => x.id === 'funnel_jam')
    expect(jam?.title).toContain('Used a feature')
    expect(jam?.severity).toBe('watch')
  })

  it('flags stalled programs (low completion + real starts) and sorts risks first', () => {
    const out = synthesizeInsights({
      ...base,
      challenges: [{ name: 'The Completionist', started: 4, completed: 0, rate: 0 }],
      quests: [{ name: 'Welcome', started: 1, rate: 0, avgStallStep: 1 }], // too few starts → ignored
    })
    expect(out.some((x) => x.title.includes('The Completionist'))).toBe(true)
    expect(out.some((x) => x.title.includes('Welcome'))).toBe(false)
    // risks sort ahead of goods
    expect(out[0].severity).toBe('risk')
  })
})

describe('summarize', () => {
  it('reports healthy when nothing is flagged', () => {
    expect(summarize([])).toContain('healthy')
  })
  it('counts risks and watches', () => {
    const s = summarize([
      { id: 'a', severity: 'risk', title: '', finding: '', recommendation: '' },
      { id: 'b', severity: 'watch', title: '', finding: '', recommendation: '' },
    ])
    expect(s).toContain('1 thing needs attention')
    expect(s).toContain('1 to watch')
  })
})

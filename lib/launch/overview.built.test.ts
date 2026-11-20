import { describe, expect, it } from 'vitest'
import { builtFeatures } from './overview'

const row = (id: string, state: 'done' | 'next' | 'later') => ({ id, title: id, done: 0, total: 1, ratio: 0, state }) as Parameters<typeof builtFeatures>[0][number]

describe('builtFeatures (LIVE-2484)', () => {
  it('reads each builder as built only when its whole section is done', () => {
    expect(builtFeatures([row('space', 'done'), row('website', 'next'), row('email', 'later')])).toEqual(['space'])
  })
  it('counts either Spotlight, personal or the Space one', () => {
    expect(builtFeatures([row('personal', 'done')])).toEqual(['spotlight'])
    expect(builtFeatures([row('spotlight', 'done'), row('email', 'done')])).toEqual(['spotlight', 'email'])
  })
})

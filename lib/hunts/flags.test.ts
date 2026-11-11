import { afterEach, describe, expect, it } from 'vitest'
import { HUNT_SWITCH_KEYS, huntSwitchOn } from './flags'
import type { HuntSwitch } from './flags'

const NAMES = Object.keys(HUNT_SWITCH_KEYS) as HuntSwitch[]

afterEach(() => {
  for (const key of Object.values(HUNT_SWITCH_KEYS)) delete process.env[key]
})

describe('Hunt switches', () => {
  it('are all off when nothing is set', () => {
    for (const n of NAMES) expect(huntSwitchOn(n)).toBe(false)
  })

  it('treat blank and unknown spellings as off', () => {
    process.env.HUNTS_ENABLED = ''
    expect(huntSwitchOn('enabled')).toBe(false)
    process.env.HUNTS_ENABLED = 'yes'
    expect(huntSwitchOn('enabled')).toBe(false)
  })

  it('accept 1, true and on', () => {
    for (const v of ['1', 'true', 'ON']) {
      process.env.HUNTS_ENABLED = v
      expect(huntSwitchOn('enabled')).toBe(true)
    }
  })

  it('keep a child off while its parent is off', () => {
    process.env.HUNTS_CLAIMS_ENABLED = '1'
    process.env.HUNTS_REWARDS_ENABLED = '1'
    process.env.HUNTS_AUTHORING_ENABLED = '1'
    process.env.HUNTS_WORKER_ENABLED = '1'
    for (const n of NAMES) expect(huntSwitchOn(n)).toBe(false)
  })

  it('opens the reward rung only through enabled and claims', () => {
    process.env.HUNTS_ENABLED = '1'
    process.env.HUNTS_REWARDS_ENABLED = '1'
    expect(huntSwitchOn('rewards')).toBe(false)
    process.env.HUNTS_CLAIMS_ENABLED = '1'
    expect(huntSwitchOn('rewards')).toBe(true)
  })

  it('opens commerce only through enabled, and independently of claims', () => {
    process.env.HUNTS_COMMERCE_ENABLED = '1'
    expect(huntSwitchOn('commerce')).toBe(false)
    process.env.HUNTS_ENABLED = '1'
    expect(huntSwitchOn('commerce')).toBe(true)
    expect(huntSwitchOn('claims')).toBe(false)
  })
})

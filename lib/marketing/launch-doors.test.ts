import { describe, expect, it } from 'vitest'
import { isSafeInAppPath } from '@/lib/funnels/destination'
import { LAUNCH_DOORS, launchDoorBySlug } from './launch-doors'

describe('LAUNCH_DOORS', () => {
  it('holds the five funnels, each with its own slug and campaign', () => {
    expect(LAUNCH_DOORS.map((d) => d.slug)).toEqual([
      'calm-down-fast',
      'find-your-people',
      'host-one-circle',
      'bring-your-practice',
      'run-it-together',
    ])
    for (const d of LAUNCH_DOORS) expect(d.utmCampaign).toBe(d.slug)
    expect(launchDoorBySlug('host-one-circle')?.name).toBe('Host one Circle')
    expect(launchDoorBySlug('nope')).toBeUndefined()
  })

  it('lands every button on a safe in-app path', () => {
    for (const d of LAUNCH_DOORS) expect(isSafeInAppPath(d.buttonHref)).toBe(true)
  })

  it('keeps the copy rules: no prices, percentages or em dashes', () => {
    for (const d of LAUNCH_DOORS) expect(`${d.promise} ${d.detail} ${d.buttonLabel}`).not.toMatch(/[—$%]/)
  })
})

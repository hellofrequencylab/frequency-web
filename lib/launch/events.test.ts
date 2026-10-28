import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pixelSafeProps } from '@/lib/analytics/sanitize'

const recorded: unknown[] = []
vi.mock('@/lib/engagement/events', () => ({
  recordEngagementEvent: async (input: { idempotencyKey: string }) => {
    const dup = recorded.some((r) => (r as { idempotencyKey: string }).idempotencyKey === input.idempotencyKey)
    if (!dup) recorded.push(input)
    return { recorded: !dup, id: 'x' }
  },
}))

import { LAUNCH_EVENT_TYPES, LAUNCH_SOURCE_KINDS, launchEventProps, medianSecondsToPublish, recordLaunchEvent, type LaunchEvent } from './events'
import { LAUNCH_STEP_IDS } from './steps'

const ID = '0b1d2c3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'
const BANNED = /persona|archetype|topic|interest|mood|answer|journeyslug|circleslug|arrival/i

function everyEvent(): LaunchEvent[] {
  const out: LaunchEvent[] = []
  for (const type of LAUNCH_EVENT_TYPES) {
    if (type === 'source_added') for (const sourceKind of LAUNCH_SOURCE_KINDS) out.push({ type, launchId: ID, sourceKind })
    else if (type.startsWith('step_')) for (const step of LAUNCH_STEP_IDS) out.push({ type, launchId: ID, step })
    else out.push({ type, launchId: ID })
  }
  return out
}

describe('launch events are pixel safe (VLS-03)', () => {
  it('carry only an opaque id, a step and a source kind, and survive pixelSafeProps unchanged', () => {
    for (const e of everyEvent()) {
      const props = launchEventProps(e)!
      expect(props, e.type).not.toBeNull()
      expect(pixelSafeProps(props)).toEqual(props)
      expect(Object.keys(props).every((k) => ['launchId', 'step', 'sourceKind'].includes(k))).toBe(true)
      expect(JSON.stringify(props)).not.toMatch(BANNED)
    }
  })

  it('refuses extra fields, so nothing a person typed can ride along', () => {
    const sneaky = { type: 'step_published', launchId: ID, step: 'space', persona: 'healer', topic: 'grief', answer: 'my story' } as unknown as LaunchEvent
    const props = launchEventProps(sneaky)!
    expect(Object.keys(props).sort()).toEqual(['launchId', 'step'])
  })

  it('refuses a malformed event: a bad id, a missing step, an unknown step or source kind', () => {
    expect(launchEventProps({ type: 'launch_started', launchId: 'not-a-uuid' })).toBeNull()
    expect(launchEventProps({ type: 'step_published', launchId: ID })).toBeNull()
    expect(launchEventProps({ type: 'step_published', launchId: ID, step: 'wizard' as never })).toBeNull()
    expect(launchEventProps({ type: 'source_added', launchId: ID, sourceKind: 'my-diary' as never })).toBeNull()
    expect(launchEventProps({ type: 'nope' as never, launchId: ID })).toBeNull()
  })
})

describe('recordLaunchEvent', () => {
  beforeEach(() => { recorded.length = 0 })

  it('records once per (launch, event, step) and says so on a repeat', async () => {
    expect(await recordLaunchEvent('p1', { type: 'step_published', launchId: ID, step: 'spotlight' })).toBe(true)
    expect(await recordLaunchEvent('p1', { type: 'step_published', launchId: ID, step: 'spotlight' })).toBe(false)
    expect(await recordLaunchEvent('p1', { type: 'step_published', launchId: ID, step: 'space' })).toBe(true)
    expect(recorded).toHaveLength(2)
  })

  it('counts each source add on its own nonce, and writes a refused event nowhere', async () => {
    const add = { type: 'source_added', launchId: ID, sourceKind: 'website' } as const
    expect(await recordLaunchEvent('p1', add, 'a')).toBe(true)
    expect(await recordLaunchEvent('p1', add, 'b')).toBe(true)
    expect(await recordLaunchEvent('p1', add, 'a')).toBe(false)
    expect(await recordLaunchEvent('p1', { type: 'step_started', launchId: ID })).toBe(false)
    expect(recorded).toHaveLength(2)
    const row = recorded[0] as { source: string; context: Record<string, unknown> }
    expect(row.source).toBe('web')
    expect(row.context).toEqual({ launchId: ID, sourceKind: 'website' })
  })
})

describe('medianSecondsToPublish', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 28, 12, 0, s))
  const L1 = '11111111-1111-4111-8111-111111111111'
  const L2 = '22222222-2222-4222-8222-222222222222'
  const L3 = '33333333-3333-4333-8333-333333333333'

  it('is the median seconds from start to the first publish of each step', () => {
    const med = medianSecondsToPublish([
      { launchId: L1, type: 'launch_started', at: at(0) },
      { launchId: L2, type: 'launch_started', at: at(0) },
      { launchId: L3, type: 'launch_started', at: at(0) },
      { launchId: L1, type: 'step_published', step: 'spotlight', at: at(100) },
      { launchId: L1, type: 'step_published', step: 'spotlight', at: at(900) },
      { launchId: L2, type: 'step_published', step: 'spotlight', at: at(300) },
      { launchId: L3, type: 'step_published', step: 'spotlight', at: at(200) },
      { launchId: L1, type: 'step_published', step: 'space', at: at(400) },
      { launchId: L2, type: 'step_published', step: 'space', at: at(600) },
    ])
    expect(med).toEqual({ spotlight: 200, space: 500 })
  })

  it('ignores a publish with no start, one before the start, and a step nobody published', () => {
    expect(medianSecondsToPublish([
      { launchId: L1, type: 'step_published', step: 'spotlight', at: at(50) },
      { launchId: L2, type: 'launch_started', at: at(100) },
      { launchId: L2, type: 'step_published', step: 'website', at: at(10) },
    ])).toEqual({})
    expect(medianSecondsToPublish([])).toEqual({})
  })
})

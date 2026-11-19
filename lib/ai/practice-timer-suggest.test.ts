import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ complete: vi.fn(), enabled: true }))
vi.mock('./client', () => ({ aiEnabled: () => m.enabled }))
vi.mock('./usage', () => ({ featureOverBudget: async () => false }))
vi.mock('./rate-limit', () => ({ aiRateLimited: async () => false }))
vi.mock('./complete', () => ({ completeRaw: m.complete }))
import { PRACTICE_TIMER, coerceTimerPicks, suggestTimerPicks } from './practice-timer-suggest'
import { dailyCapFor } from './budget'

const answer = (input: unknown) => ({ content: [{ type: 'tool_use', name: 'recommend_timer_setups', input }] })
beforeEach(() => { vi.clearAllMocks(); m.enabled = true })

describe('Vera can only choose timer setups from the closed catalog', () => {
  it('accepts IDs and an allowed length, and nothing else', () => {
    expect(coerceTimerPicks({ picks: [{ setupId: 'box-breathing', reasonId: 'breath', minutes: 5 }, { setupId: 'log-it', reasonId: 'act' }] })).toEqual([
      { setupId: 'box-breathing', reasonId: 'breath', minutes: 5 },
      { setupId: 'log-it', reasonId: 'act', minutes: null },
    ])
  })

  it.each([
    ['a setup that is not in the catalog', { picks: [{ setupId: 'sunrise-flow', reasonId: 'general' }] }],
    ['a reason in her own words', { picks: [{ setupId: 'quiet-sit', reasonId: 'This will change your life' }] }],
    ['a length that is not on the list', { picks: [{ setupId: 'quiet-sit', reasonId: 'sit', minutes: 7 }] }],
    ['an extra field on a pick', { picks: [{ setupId: 'quiet-sit', reasonId: 'sit', label: 'Sunrise Flow' }] }],
    ['an extra field beside the picks', { picks: [{ setupId: 'quiet-sit', reasonId: 'sit' }], title: 'Invented' }],
    ['more than three picks', { picks: Array.from({ length: 4 }, () => ({ setupId: 'quiet-sit', reasonId: 'sit' })) }],
    ['no picks', { picks: [] }],
    ['plain prose', 'Try a ten minute sit.'],
  ])('rejects %s outright', (_name, raw) => {
    expect(coerceTimerPicks(raw)).toBeNull()
  })

  it('is a Haiku spark on its own budget key', () => {
    expect(PRACTICE_TIMER).toMatchObject({ entity: 'practice', feature: 'practice-timer', tier: 'haiku' })
    expect(dailyCapFor('practice-timer')).toBeGreaterThan(0)
  })
})

describe('suggestTimerPicks', () => {
  it("sends the author's words, attributes the call, and keeps the length they set", async () => {
    m.complete.mockResolvedValue(answer({ picks: [{ setupId: 'easy-walk', reasonId: 'walk', minutes: 30 }] }))
    const picks = await suggestTimerPicks({ title: 'Evening walk', body: 'Loop the block.', durationMin: 12, profileId: 'author' })
    expect(picks).toEqual([{ setupId: 'easy-walk', reasonId: 'walk', minutes: 12 }])
    const call = m.complete.mock.calls[0][0]
    expect(JSON.stringify(call.messages)).toContain('Evening walk')
    expect(call.accounting).toMatchObject({ feature: 'practice-timer', profileId: 'author' })
  })

  it('answers null for an unusable reply, so the caller falls back to the offline match', async () => {
    m.complete.mockResolvedValue(answer({ picks: [{ setupId: 'quiet-sit', reasonId: 'sit' }], body: 'Sit down and breathe.' }))
    expect(await suggestTimerPicks({ title: 'Morning sit' })).toBeNull()
  })

  it('does not call a model when Vera is off or nothing is written yet', async () => {
    expect(await suggestTimerPicks({ title: '  ' })).toBeNull()
    m.enabled = false
    expect(await suggestTimerPicks({ title: 'Morning sit' })).toBeNull()
    expect(m.complete).not.toHaveBeenCalled()
  })
})

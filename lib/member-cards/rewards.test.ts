import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// MEMBER CARDS x THE GAME (LIVE-1282). Locks the app-side wiring of lib/member-cards/rewards.ts:
// the pair key is order-independent, a connect pays both members 'meetup_tap' once per pair per ISO
// week (the dedupe itself is card_meet()'s unique meet_taps row, simulated here with the same rule),
// and a swap pays the owner 'card_swap' through the capped entry point and moves Open Door only when
// it paid. The SQL limits are verified against Postgres, not here.

const rpcCalls: Array<{ fn: string; args: Record<string, string> }> = []
const awards: Array<{ profileId: string; action: string }> = []
const events: Array<{ type: string; profileId: string }> = []
let rpcError: { message: string } | null = null
let awardResult: { awarded: boolean; amount: number; capped?: boolean } = { awarded: true, amount: 15 }

// card_meet() in miniature: a < b, one row per pair per Monday-start week, self refused.
const meetRows = new Set<string>()
function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
function fakeCardMeet(args: Record<string, string>) {
  const { _tapper, _owner, _day } = args
  if (_tapper === _owner) return { ok: false, reason: 'self' }
  const [a, b] = [_tapper, _owner].sort()
  const key = `${a}:${b}:${weekStart(_day)}`
  if (meetRows.has(key)) return { ok: false, reason: 'already_this_week', other_profile_id: _owner }
  meetRows.add(key)
  return { ok: true, reason: null, other_profile_id: _owner }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const client = {
      rest: {},
      rpc(this: { rest?: unknown }, fn: string, args: Record<string, string>) {
        if (!this?.rest) throw new Error('detached rpc')
        rpcCalls.push({ fn, args })
        if (rpcError) return Promise.resolve({ data: null, error: rpcError })
        return Promise.resolve({ data: fakeCardMeet(args), error: null })
      },
    }
    return client
  },
}))

vi.mock('@/lib/zaps', () => ({
  awardZapsForAction: async (profileId: string, action: string) => {
    awards.push({ profileId, action })
    return awardResult
  },
}))

vi.mock('@/lib/achievements', () => ({
  processGamificationEvent: async (event: { type: string; profileId: string }) => {
    events.push(event)
    return []
  },
}))

import { cardPairKey, cardMeetDay, payCardConnect, payCardSwap } from './rewards'

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'

beforeEach(() => {
  rpcCalls.length = 0
  awards.length = 0
  events.length = 0
  meetRows.clear()
  rpcError = null
  awardResult = { awarded: true, amount: 15 }
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-21T15:00:00Z')) // a Wednesday
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cardPairKey', () => {
  it('is the same whichever member tapped', () => {
    expect(cardPairKey(A, B)).toBe(cardPairKey(B, A))
    expect(cardPairKey(B, A)).toBe(`${A}:${B}`)
  })

  it('tells different pairs apart', () => {
    expect(cardPairKey(A, B)).not.toBe(cardPairKey(A, C))
  })
})

describe('cardMeetDay', () => {
  it('is the UTC calendar day', () => {
    expect(cardMeetDay(new Date('2026-10-21T23:59:59Z'))).toBe('2026-10-21')
  })
})

describe('payCardConnect', () => {
  it('records the meet through card_meet and pays BOTH members meetup_tap', async () => {
    const out = await payCardConnect(A, B)
    expect(out).toEqual({ zaps: 15 })
    expect(rpcCalls).toEqual([{ fn: 'card_meet', args: { _tapper: A, _owner: B, _day: '2026-10-21' } }])
    expect(awards).toEqual([
      { profileId: A, action: 'meetup_tap' },
      { profileId: B, action: 'meetup_tap' },
    ])
    expect(events).toEqual([
      { type: 'card_connect', profileId: A },
      { type: 'card_connect', profileId: B },
    ])
  })

  it('pays once per pair per week, whichever of the two taps the other', async () => {
    expect(await payCardConnect(A, B)).toEqual({ zaps: 15 })
    vi.setSystemTime(new Date('2026-10-25T10:00:00Z')) // Sunday, same ISO week
    expect(await payCardConnect(B, A)).toBeNull()
    expect(awards).toHaveLength(2) // only the first meet paid
    expect(events).toHaveLength(2)
  })

  it('pays the pair again the next ISO week', async () => {
    await payCardConnect(A, B)
    vi.setSystemTime(new Date('2026-10-26T09:00:00Z')) // Monday, a new week
    expect(await payCardConnect(B, A)).toEqual({ zaps: 15 })
    expect(awards).toHaveLength(4)
  })

  it('a different pair in the same week is its own meet', async () => {
    await payCardConnect(A, B)
    expect(await payCardConnect(A, C)).toEqual({ zaps: 15 })
  })

  it('refuses a self tap without calling the writer or paying', async () => {
    expect(await payCardConnect(A, A)).toBeNull()
    expect(rpcCalls).toHaveLength(0)
    expect(awards).toHaveLength(0)
  })

  it('records the meet but reports 0 when the tapper hit the daily cap', async () => {
    awardResult = { awarded: false, amount: 0, capped: true }
    expect(await payCardConnect(A, B)).toEqual({ zaps: 0 })
    expect(events).toHaveLength(2) // the meet still counts toward First Tap / Card Shark
  })

  it('pays nothing when the writer fails', async () => {
    rpcError = { message: 'boom' }
    expect(await payCardConnect(A, B)).toBeNull()
    expect(awards).toHaveLength(0)
    expect(events).toHaveLength(0)
  })
})

describe('payCardSwap', () => {
  it('pays the owner card_swap through the capped entry point and moves Open Door', async () => {
    awardResult = { awarded: true, amount: 5 }
    expect(await payCardSwap(B)).toEqual({ zaps: 5 })
    expect(awards).toEqual([{ profileId: B, action: 'card_swap' }])
    expect(events).toEqual([{ type: 'card_swap', profileId: B }])
    expect(rpcCalls).toHaveLength(0)
  })

  it('returns null and fires no event once the daily cap is spent', async () => {
    awardResult = { awarded: false, amount: 0, capped: true }
    expect(await payCardSwap(B)).toBeNull()
    expect(events).toHaveLength(0)
  })

  it('returns null for no owner', async () => {
    expect(await payCardSwap('')).toBeNull()
    expect(awards).toHaveLength(0)
  })
})

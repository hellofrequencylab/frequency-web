import { describe, it, expect, vi, beforeEach } from 'vitest'

// The member-card achievements (LIVE-1282) through the real engine in lib/achievements.ts:
// 'card_connects' counts meet_taps rows via 'card', 'card_swaps' counts paid card_swap ledger rows,
// and each moves only on its own card event.

type Result = { data: unknown; error: null; count?: number | null }
const tableData: Record<string, Result> = {}
const reads: Array<{ table: string; filters: string[] }> = []
const achievementInserts: Array<Record<string, unknown>> = []

function chain(table: string): Record<string, unknown> {
  const filters: string[] = []
  reads.push({ table, filters })
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        const res = () => tableData[table] ?? { data: [], error: null, count: 0 }
        if (prop === 'then') return (ok: (v: Result) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, bad)
        if (prop === 'maybeSingle' || prop === 'single') return async () => res()
        return (...args: unknown[]) => {
          filters.push(`${prop}(${args.map((a) => (typeof a === 'object' ? '' : String(a))).join(',')})`)
          return proxy
        }
      },
    },
  )
  return proxy
}

const admin = {
  from: (table: string) => ({
    select: () => chain(table),
    insert: (payload: Record<string, unknown>) => {
      if (table === 'user_achievements') achievementInserts.push(payload)
      return chain(`${table}:insert`)
    },
  }),
  rpc: async () => ({ data: null, error: null }),
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/zaps', () => ({ awardZaps: async () => ({ awarded: true, amount: 0 }) }))
vi.mock('@/lib/gems', () => ({ awardGems: async () => ({ awarded: true, amount: 0, capped: false }) }))

import { processGamificationEvent } from '@/lib/achievements'

const FIRST_TAP = {
  id: 'a-first-tap', slug: 'card-first-tap', name: 'First Tap', description: '', icon: 'users',
  tier: 'bronze', zaps_reward: 0, criteria: { type: 'card_connects', count: 1 },
}
const CARD_SHARK = {
  id: 'a-card-shark', slug: 'card-shark', name: 'Card Shark', description: '', icon: 'link',
  tier: 'silver', zaps_reward: 0, criteria: { type: 'card_connects', count: 10 },
}
const OPEN_DOOR = {
  id: 'a-open-door', slug: 'card-open-door', name: 'Open Door', description: '', icon: 'message-circle',
  tier: 'silver', zaps_reward: 0, criteria: { type: 'card_swaps', count: 25 },
}

beforeEach(() => {
  for (const k of Object.keys(tableData)) delete tableData[k]
  reads.length = 0
  achievementInserts.length = 0
  tableData['achievements'] = { data: [FIRST_TAP, CARD_SHARK, OPEN_DOOR], error: null }
})

describe('card achievements', () => {
  it('a first card connect unlocks First Tap, not Card Shark or Open Door', async () => {
    tableData['meet_taps'] = { data: null, error: null, count: 1 }
    tableData['zap_transactions'] = { data: null, error: null, count: 30 }
    const unlocked = await processGamificationEvent({ type: 'card_connect', profileId: 'p1' })
    expect(unlocked.map((a) => a.id)).toEqual(['a-first-tap'])
    const meet = reads.find((r) => r.table === 'meet_taps')
    expect(meet?.filters).toContain('eq(via,card)')
    expect(meet?.filters).toContain('or(a_profile_id.eq.p1,b_profile_id.eq.p1)')
  })

  it('the tenth card connect unlocks Card Shark', async () => {
    tableData['meet_taps'] = { data: null, error: null, count: 10 }
    const unlocked = await processGamificationEvent({ type: 'card_connect', profileId: 'p1' })
    expect(unlocked.map((a) => a.id)).toEqual(['a-first-tap', 'a-card-shark'])
  })

  it('the 25th paid swap unlocks Open Door, counted from the card_swap ledger', async () => {
    tableData['zap_transactions'] = { data: null, error: null, count: 25 }
    const unlocked = await processGamificationEvent({ type: 'card_swap', profileId: 'p1' })
    expect(unlocked.map((a) => a.id)).toEqual(['a-open-door'])
    const ledger = reads.find((r) => r.table === 'zap_transactions')
    expect(ledger?.filters).toContain('eq(action_type,card_swap)')
  })

  it('a non-card event neither checks the card badges nor reads the card counts', async () => {
    tableData['meet_taps'] = { data: null, error: null, count: 99 }
    const unlocked = await processGamificationEvent({ type: 'post_create', profileId: 'p1' })
    expect(unlocked).toEqual([])
    expect(reads.some((r) => r.table === 'meet_taps')).toBe(false)
  })
})

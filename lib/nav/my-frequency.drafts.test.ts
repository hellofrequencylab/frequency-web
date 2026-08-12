import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── THE DRAFTS COUNT IS ACTUALLY FETCHED (owner ruling 2026-08-12, CP-4) ──────────────
//
// lib/nav/my-frequency-rows.ts proves the ROW carries whatever count it is handed. This proves
// the menu resolver actually goes and gets one — the half that would silently regress to a
// permanent 0 if someone dropped the read while keeping the field.
//
// It also pins the two properties that make the read affordable on a menu that renders on every
// page: it joins the SAME parallel wave as the other three reads (no serial round trip), and any
// failure resolves to 0, which renders no badge at all. `countMyCreateProposals` is a head-count
// with every filter in SQL and its own covering index; the cost that matters here is WHEN it runs.

type OperatedSpace = { id: string; name: string; slug: string }

const countMyCreateProposals = vi.fn<() => Promise<number>>(async () => 0)
const listOperatedSpaces = vi.fn<(id: string) => Promise<OperatedSpace[]>>(async () => [])

vi.mock('@/lib/ai/vera/create-entity', () => ({
  countMyCreateProposals: () => countMyCreateProposals(),
}))
vi.mock('@/lib/spaces/operated', () => ({
  listOperatedSpaces: (id: string) => listOperatedSpaces(id),
}))

/** A `from(...).select(...)...` chain that resolves to no rows, whatever is chained onto it. */
function emptyQuery() {
  const result = Promise.resolve({ data: [], error: null })
  const chain: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'is', 'in', 'gte', 'order', 'limit']) {
    chain[k] = () => chain
  }
  chain.then = result.then.bind(result)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => emptyQuery() }),
}))

const { getMyFrequency } = await import('./my-frequency')

/** React `cache` memoizes per argument, so each case needs its own member. */
let seq = 0
const nextMember = () => `member-${++seq}`

beforeEach(() => {
  countMyCreateProposals.mockReset()
  countMyCreateProposals.mockResolvedValue(0)
  listOperatedSpaces.mockReset()
  listOperatedSpaces.mockResolvedValue([])
})

describe('getMyFrequency resolves the drafts badge', () => {
  it('reads the open-proposal count and hands it to the Drafts row', async () => {
    countMyCreateProposals.mockResolvedValue(4)
    const menu = await getMyFrequency(nextMember(), 'ada')
    expect(countMyCreateProposals).toHaveBeenCalledTimes(1)
    expect(menu.drafts).toBe(4)
  })

  it('folds the count into the TOTAL the folded rail wears', async () => {
    // The parent row carries the sum, so a member whose rail is collapsed still sees that
    // something wants them. A proposal that expires unseen cannot be recovered, which is the
    // whole reason it earns a place in that number.
    countMyCreateProposals.mockResolvedValue(2)
    const menu = await getMyFrequency(nextMember(), 'ada')
    expect(menu.total).toBe(2)
  })

  it('renders no badge when there is nothing waiting', async () => {
    const menu = await getMyFrequency(nextMember(), 'ada')
    expect(menu.drafts).toBe(0)
    expect(menu.total).toBe(0)
  })

  it('does NOT wait on the other reads first — it joins the same parallel wave', async () => {
    // A count that starts only after the Spaces read finishes is a serial round trip on every
    // page render. Assert the shape rather than the clock: the count is requested while the
    // slowest sibling is still pending.
    let spacesResolved = false
    let countStartedBeforeSpaces = false
    listOperatedSpaces.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            spacesResolved = true
            resolve([])
          }, 20)
        }),
    )
    countMyCreateProposals.mockImplementation(async () => {
      countStartedBeforeSpaces = !spacesResolved
      return 1
    })
    const menu = await getMyFrequency(nextMember(), 'ada')
    expect(countStartedBeforeSpaces).toBe(true)
    expect(menu.drafts).toBe(1)
  })

  it('FAIL-SAFE: a throwing count leaves a profile-only menu, never a broken rail', async () => {
    // Navigation never blocks and never throws (the file's own standing rule). The count is
    // internally fail-safe too, so this is the belt on top of the braces.
    countMyCreateProposals.mockRejectedValue(new Error('agent_actions is having a day'))
    const menu = await getMyFrequency(nextMember(), 'ada')
    expect(menu.drafts).toBe(0)
    expect(menu.total).toBe(0)
    expect(menu.profileHref).toBe('/people/ada')
  })
})

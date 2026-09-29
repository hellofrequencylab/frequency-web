import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// The Pillar balance module reads the per-Pillar Zap ledger (LIVE-642, ADR-1605). The session
// and the Pillar taxonomy are stubbed at their seams; the ledger read itself
// (getMemberPillarZaps) runs for real over an in-memory admin client, so what this pins is the
// consequence a member sees: four Pillars, each with the Zaps its logs earned, summing to the
// member's Zaps from practice logs.

const PILLARS = [
  { id: 'id-mind', slug: 'mind', name: 'Mind' },
  { id: 'id-body', slug: 'body', name: 'Body' },
  { id: 'id-spirit', slug: 'spirit', name: 'Spirit' },
  { id: 'id-expression', slug: 'expression', name: 'Expression' },
] as const

const state: {
  profileId: string | null
  counts: Record<string, number>
  logs: Record<string, unknown>[]
  practices: Record<string, unknown>[]
} = { profileId: 'me', counts: {}, logs: [], practices: [] }

vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => state.profileId }))

vi.mock('@/lib/pillars', () => ({
  getPillars: async () =>
    PILLARS.map((p, i) => ({ ...p, description: null, accent: null, order: i })),
  getMemberPillarBalance: async () =>
    PILLARS.map((p) => ({ slug: p.slug, name: p.name, count: state.counts[p.slug] ?? 0 })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const rows = table === 'practice_logs' ? state.logs : state.practices
      const builder = {
        select: () => builder,
        eq: () => builder,
        gt: () => Promise.resolve({ data: rows, error: null }),
        in: (_c: string, ids: string[]) =>
          Promise.resolve({ data: rows.filter((r) => ids.includes(r.id as string)), error: null }),
      }
      return builder
    },
  }),
}))

import { PracticesBalance } from './practices-balance'

async function render(): Promise<string> {
  const node = await PracticesBalance()
  return node ? renderToStaticMarkup(node) : ''
}

/** The per-Pillar Zap figures the module rendered, keyed by Pillar slug. */
function pillarZaps(html: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of html.matchAll(/data-pillar="([a-z]+)"[\s\S]*?data-pillar-zaps="(\d+)"/g)) {
    out[m[1]] = Number(m[2])
  }
  return out
}

beforeEach(() => {
  state.profileId = 'me'
  state.counts = {}
  state.logs = []
  state.practices = []
})

describe('PracticesBalance: the per-Pillar Zap ledger on the member balance', () => {
  it('renders all four Pillars with the Zaps each earned, summing to the Zaps from practice logs', async () => {
    state.counts = { mind: 2, body: 1 }
    state.logs = [
      // Frozen 75/25 Mind/Body: 12 → 9 + 3.
      { practice_id: 'p1', zaps_awarded: 12, pillar_id: 'id-mind', secondary_pillar_id: 'id-body', primary_pct: 75 },
      // Frozen single-Pillar Spirit.
      { practice_id: 'p2', zaps_awarded: 15, pillar_id: 'id-spirit', secondary_pillar_id: null, primary_pct: 100 },
      // Pre-freeze: the practice's current split (Expression) attributes it.
      { practice_id: 'p3', zaps_awarded: 8, pillar_id: null, secondary_pillar_id: null, primary_pct: null },
    ]
    state.practices = [{ id: 'p3', domain_id: 'id-expression', secondary_domain_id: null, primary_pct: 75 }]

    const html = await render()
    const zaps = pillarZaps(html)
    expect(Object.keys(zaps)).toEqual(['mind', 'body', 'spirit', 'expression'])
    expect(zaps).toEqual({ mind: 9, body: 3, spirit: 15, expression: 8 })

    const logTotal = state.logs.reduce((a, l) => a + (l.zaps_awarded as number), 0)
    expect(Object.values(zaps).reduce((a, b) => a + b, 0)).toBe(logTotal)
    expect(html).toContain(`>${logTotal}</span> Zaps`)
    expect(html).not.toContain('data-no-pillar-zaps')
  })

  it('names Zaps from a practice with no Pillar, so the lines still add up to the total', async () => {
    state.counts = { mind: 1 }
    state.logs = [
      { practice_id: 'p1', zaps_awarded: 12, pillar_id: 'id-mind', secondary_pillar_id: null, primary_pct: 100 },
      { practice_id: 'gone', zaps_awarded: 5, pillar_id: null, secondary_pillar_id: null, primary_pct: null },
    ]
    const html = await render()
    const shown = Object.values(pillarZaps(html)).reduce((a, b) => a + b, 0)
    const noPillar = Number(/data-no-pillar-zaps="(\d+)"/.exec(html)?.[1] ?? 0)
    expect(shown).toBe(12)
    expect(noPillar).toBe(5)
    expect(shown + noPillar).toBe(17)
  })

  it('shows Zap lines for a member who earned Zaps but has adopted nothing right now', async () => {
    state.logs = [
      { practice_id: 'p1', zaps_awarded: 9, pillar_id: 'id-body', secondary_pillar_id: null, primary_pct: 100 },
    ]
    const html = await render()
    expect(pillarZaps(html)).toEqual({ mind: 0, body: 9, spirit: 0, expression: 0 })
    expect(html).not.toContain('Adopt a practice from the library')
  })

  it('keeps the empty line and no Zap lines when there is nothing adopted and nothing earned', async () => {
    const html = await render()
    expect(html).toContain('Adopt a practice from the library')
    expect(html).not.toContain('data-pillar-zaps')
  })

  it('renders nothing for a logged-out viewer', async () => {
    state.profileId = null
    expect(await render()).toBe('')
  })
})

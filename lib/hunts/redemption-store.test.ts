import { afterEach, describe, expect, it, vi } from 'vitest'

const rows: Record<string, unknown> = {}
const failures = new Set<string>()
const selects: [string, string][] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      q.select = (columns: string) => {
        selects.push([table, columns])
        return q
      }
      for (const method of ['eq', 'in']) q[method] = () => q
      q.maybeSingle = async () => ({ data: rows[table] ?? null, error: failures.has(table) ? { message: 'read failed' } : null })
      return q
    },
  }),
}))

import { loadGrant } from './redemption-store'

const GRANT = '00000000-0000-4000-a022-0000000000c1'

afterEach(() => {
  for (const k of Object.keys(rows)) delete rows[k]
  failures.clear()
  selects.length = 0
})

describe('loadGrant', () => {
  const seed = () => {
    rows.hunt_reward_grants = { id: GRANT, hunt_id: 'h1', profile_id: 'p1', state: 'granted', expires_at: null, reward_id: 'r1' }
    rows.hunt_rewards = { title: 'A free tea', kind: 'perk', version_id: 'v1' }
    rows.hunt_versions = { trail_title: ' Harbour Trail ' }
    rows.hunts = { slug: 'harbour-trail' }
  }

  it('takes the Trail title from the published version, never a column the Hunt table does not have', async () => {
    seed()
    const out = await loadGrant(GRANT)
    expect(out).toMatchObject({ reward_title: 'A free tea', reward_kind: 'perk', trail_title: 'Harbour Trail' })
    expect(selects.find(([table]) => table === 'hunts')?.[1]).not.toMatch(/title/)
    expect(selects.find(([table]) => table === 'hunt_versions')?.[1]).toMatch(/policy->trail->>title/)
  })

  it('falls back to the slug when the version carries no title', async () => {
    seed()
    rows.hunt_versions = { trail_title: null }
    expect((await loadGrant(GRANT))?.trail_title).toBe('harbour-trail')
  })

  it('is null for an unknown grant and for a failed read', async () => {
    expect(await loadGrant(GRANT)).toBeNull()
    seed()
    failures.add('hunt_versions')
    expect(await loadGrant(GRANT)).toBeNull()
  })
})

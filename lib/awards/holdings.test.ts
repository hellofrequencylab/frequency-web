import { describe, it, expect } from 'vitest'
import { memberHeldItems, memberHoldsItem, type HoldingsClient } from './holdings'

// The one inventory read (ADR-1279). A store_redemptions row joined to its store_items slug IS
// ownership; the read is pure over whatever client is handed in, and it fails CLOSED: any error or
// odd shape reads as "holds nothing", so a cosmetic gate can never unlock on a broken query.

type Stub = HoldingsClient & { calls: unknown[][] }
function stub(result: { data: unknown; error?: unknown } | Error): Stub {
  const calls: unknown[][] = []
  return {
    calls,
    from(table: string) {
      calls.push(['from', table])
      return {
        select(columns: string) {
          calls.push(['select', columns])
          return {
            eq(column: string, value: string) {
              calls.push(['eq', column, value])
              if (result instanceof Error) return Promise.reject(result)
              return Promise.resolve(result)
            },
          }
        },
      }
    },
  } as unknown as Stub
}

describe('memberHeldItems', () => {
  it('reads the member\'s own redemptions joined to the item slug', async () => {
    const client = stub({ data: [{ item: { slug: 'full-spectrum-banner' } }, { item: { slug: 'rank-echo-badge' } }] })
    const held = await memberHeldItems(client, 'prof-1')
    expect([...held].sort()).toEqual(['full-spectrum-banner', 'rank-echo-badge'])
    expect(client.calls).toEqual([
      ['from', 'store_redemptions'],
      ['select', 'item:store_items(slug)'],
      ['eq', 'profile_id', 'prof-1'],
    ])
  })

  it('tolerates the array form of an embedded relation and skips rows with no item', async () => {
    const client = stub({ data: [{ item: [{ slug: 'a' }] }, { item: null }, { item: {} }, null] })
    expect([...(await memberHeldItems(client, 'prof-1'))]).toEqual(['a'])
  })

  it('fails closed: an error, a non-array, or an empty profile id holds nothing', async () => {
    expect((await memberHeldItems(stub(new Error('boom')), 'prof-1')).size).toBe(0)
    expect((await memberHeldItems(stub({ data: null }), 'prof-1')).size).toBe(0)
    const untouched = stub({ data: [{ item: { slug: 'a' } }] })
    expect((await memberHeldItems(untouched, '')).size).toBe(0)
    expect(untouched.calls).toEqual([])
  })
})

describe('memberHoldsItem', () => {
  it('answers for one slug and never for an empty key', async () => {
    const client = stub({ data: [{ item: { slug: 'full-spectrum-banner' } }] })
    expect(await memberHoldsItem(client, 'prof-1', 'full-spectrum-banner')).toBe(true)
    expect(await memberHoldsItem(client, 'prof-1', 'journey-badge-mind')).toBe(false)
    expect(await memberHoldsItem(client, 'prof-1', '')).toBe(false)
  })
})

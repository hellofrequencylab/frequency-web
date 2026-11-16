import { describe, expect, it, vi } from 'vitest'
import { readThroughPublicEventsSnapshot, PublicEventsUnavailableError } from './public-events-snapshot'

describe('readThroughPublicEventsSnapshot', () => {
  it('throws on a failed read with no snapshot instead of returning []', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(readThroughPublicEventsSnapshot('k1', async () => ({ rows: [], ok: false }))).rejects.toBeInstanceOf(
      PublicEventsUnavailableError,
    )
  })
  it('serves the last good snapshot when a later read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let t = 0
    const now = () => t
    await readThroughPublicEventsSnapshot('k2', async () => ({ rows: [1], ok: true }), now)
    t = 120_000
    const rows = await readThroughPublicEventsSnapshot('k2', async () => ({ rows: [], ok: false }), now)
    expect(rows).toEqual([1])
  })
})

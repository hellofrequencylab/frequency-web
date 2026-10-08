import { it, expect } from 'vitest'
import { completeEarningsRead } from './complete-read'
function query(rows: unknown[], failAt = -1) {
  let start = 0, end = 0
  const q = { order: () => q, range: (a: number, b: number) => { start = a; end = b; return q },
    get then() {
      const result: { data: unknown[] | null; error: { message: string } | null } = start === failAt ? { data: null, error: { message: 'offline' } } : { data: rows.slice(start, end + 1), error: null }
      const promise = Promise.resolve(result)
      return promise.then.bind(promise)
    } }
  return q
}
it('reads beyond the first page before declaring complete', async () => { expect((await completeEarningsRead(query([1, 2, 3]), 2, 6)).data).toEqual([1, 2, 3]) })
it('rejects later page failure without returning a partial total', async () => { await expect(completeEarningsRead(query([1, 2, 3], 2), 2, 6)).rejects.toThrow('offline') })
it('rejects a full bound instead of claiming completeness', async () => { await expect(completeEarningsRead(query([1, 2, 3, 4]), 2, 4)).rejects.toThrow('bound') })

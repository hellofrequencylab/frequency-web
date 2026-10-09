import { it, expect } from 'vitest'
import { completeEarningsRead } from './complete-read'
function query(rows: { id: string }[], failAfter: string | null = null, beforePage?: (after: string | null) => void) {
  let end = 0, after: string | null = null
  const q = { order: () => q, range: (_a: number, b: number) => { end = b; return q }, gt: (_column: string, value: string) => { after = value; return q },
    get then() {
      beforePage?.(after)
      const result: { data: unknown[] | null; error: { message: string } | null } = after !== null && after === failAfter ? { data: null, error: { message: 'offline' } } : { data: rows.filter(row => after === null || row.id > after).slice(0, end + 1), error: null }
      const promise = Promise.resolve(result); return promise.then.bind(promise)
    } }
  return q
}
const rows = () => ['b', 'c', 'd'].map(id => ({ id }))
it('reads beyond the first page before declaring all reads succeeded', async () => { expect((await completeEarningsRead(query(rows()), 2, 6)).data).toEqual(rows()) })
it('rejects later page failure without returning a partial total', async () => { await expect(completeEarningsRead(query(rows(), 'c'), 2, 6)).rejects.toThrow('offline') })
it('rejects a full bound instead of claiming completeness', async () => { await expect(completeEarningsRead(query([...rows(), { id: 'e' }]), 2, 4)).rejects.toThrow('bound') })
it('does not duplicate or skip the remaining rows when an earlier row is inserted or removed between pages', async () => {
  const source = rows()
  const result = await completeEarningsRead(query(source, null, after => { if (after) source.splice(0, 1, { id: 'a' }) }), 2, 6)
  expect(result.data).toEqual(rows())
})
it('rejects repeated or out-of-order IDs instead of adding a row twice', async () => { await expect(completeEarningsRead(query([{ id: 'b' }, { id: 'b' }]), 2, 6)).rejects.toThrow('ID order') })

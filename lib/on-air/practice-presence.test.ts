import { describe, expect, it } from 'vitest'
import { countPracticedToday, PRACTICE_PRESENCE_PAGE_SIZE } from './practice-presence'

function presenceClient(rows: { id: string; profile_id: string | null }[], failAt?: number) {
  const calls: { table: string; columns: string; day?: string; order?: string; range?: [number, number] }[] = []
  const client = {
    from(table: string) {
      const call: (typeof calls)[number] = { table, columns: '' }
      calls.push(call)
      return {
        select(columns: string) {
          call.columns = columns
          return {
            eq(column: string, value: string) {
              expect(column).toBe('logged_for')
              call.day = value
              return {
                order(orderColumn: string) {
                  expect(orderColumn).toBe('id')
                  call.order = orderColumn
                  return {
                    async range(from: number, to: number) {
                      call.range = [from, to]
                      if (from === failAt) return { data: null, error: new Error('read failed') }
                      return { data: rows.slice(from, to + 1), error: null }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
  // This intentionally lightweight fluent mock exercises the paging behavior without
  // implementing Supabase's full PromiseLike query contract. Keep the production seam typed.
  return { client: client as unknown as Parameters<typeof countPracticedToday>[0], calls }
}

describe('countPracticedToday', () => {
  it('counts distinct members across pages beyond PostgREST’s 1,000-row cap', async () => {
    const rows: { id: string; profile_id: string | null }[] = Array.from({ length: PRACTICE_PRESENCE_PAGE_SIZE + 1 }, (_, i) => ({
      id: String(i).padStart(5, '0'),
      profile_id: `profile-${i}`,
    }))
    // Repeated logs for earlier members must not inflate the distinct member count.
    rows.push({ id: '01001', profile_id: 'profile-0' }, { id: '01002', profile_id: null })
    const { client, calls } = presenceClient(rows)

    await expect(countPracticedToday(client, '2026-10-27')).resolves.toBe(1001)
    expect(calls.map((call) => call.range)).toEqual([[0, 999], [1000, 1999]])
    expect(calls.every((call) => call.table === 'practice_logs' && call.columns === 'id, profile_id' && call.day === '2026-10-27' && call.order === 'id')).toBe(true)
  })

  it('requests a final empty page when the result exactly fills a page', async () => {
    const rows: { id: string; profile_id: string | null }[] = Array.from({ length: PRACTICE_PRESENCE_PAGE_SIZE }, (_, i) => ({
      id: String(i).padStart(5, '0'),
      profile_id: `profile-${i}`,
    }))
    const { client, calls } = presenceClient(rows)

    await expect(countPracticedToday(client, '2026-10-27')).resolves.toBe(1000)
    expect(calls).toHaveLength(2)
    expect(calls[1].range).toEqual([1000, 1999])
  })

  it('does not return a partial count if a later page fails', async () => {
    const rows: { id: string; profile_id: string | null }[] = Array.from({ length: PRACTICE_PRESENCE_PAGE_SIZE + 1 }, (_, i) => ({
      id: String(i).padStart(5, '0'),
      profile_id: `profile-${i}`,
    }))
    const { client } = presenceClient(rows, 1000)

    await expect(countPracticedToday(client, '2026-10-27')).resolves.toBe(0)
  })
})

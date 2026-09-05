import { describe, it, expect, vi } from 'vitest'
import { mergeProfileMeta, removeProfileMetaKeys } from './meta'

// The wiring half of scan two L6-09: every profiles.meta write goes through ONE RPC that merges
// the caller's own key server-side. The SQL half (the merge keeps the other writer's key, the
// wrong user is refused) is supabase/tests/merge_profile_meta.test.sql.

function client(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result)
  return { rpc, calls: rpc.mock.calls as unknown as [string, Record<string, unknown>][] }
}

describe('mergeProfileMeta', () => {
  it('calls merge_profile_meta with the profile id and ONLY the patch it was handed', async () => {
    const c = client({ data: { a: 1, practiceStreak: { current: 2 } }, error: null })
    const res = await mergeProfileMeta(c, 'p1', { practiceStreak: { current: 2 } })
    expect(c.rpc).toHaveBeenCalledTimes(1)
    const [name, args] = c.calls[0]
    expect(name).toBe('merge_profile_meta')
    expect(args).toEqual({ p_profile_id: 'p1', p_patch: { practiceStreak: { current: 2 } } })
    expect('p_columns' in args).toBe(false)
    expect(res).toEqual({ meta: { a: 1, practiceStreak: { current: 2 } }, error: null })
  })

  it('passes the streak mirror columns as p_columns when given, and nothing else', async () => {
    const c = client({ data: {}, error: null })
    await mergeProfileMeta(c, 'p1', { practiceStreak: {} }, { current_streak: 4, longest_streak: 9 })
    expect(c.calls[0][1].p_columns).toEqual({ current_streak: 4, longest_streak: 9 })
    const c2 = client({ data: {}, error: null })
    await mergeProfileMeta(c2, 'p1', { practiceStreak: {} }, { current_streak: 4 })
    expect(c2.calls[0][1].p_columns).toEqual({ current_streak: 4 })
    const c3 = client({ data: {}, error: null })
    await mergeProfileMeta(c3, 'p1', { practiceStreak: {} }, {})
    expect('p_columns' in c3.calls[0][1]).toBe(false)
  })

  it('surfaces the RPC error as { error } and never throws', async () => {
    const c = client({ data: null, error: { message: 'not your profile' } })
    const res = await mergeProfileMeta(c, 'p1', { x: 1 })
    expect(res).toEqual({ meta: null, error: 'not your profile' })
  })

  it('refuses a non-object patch or a missing id without calling the database', async () => {
    const c = client({ data: {}, error: null })
    expect((await mergeProfileMeta(c, '', { x: 1 })).error).toMatch(/profile id/)
    expect((await mergeProfileMeta(c, 'p1', [1] as unknown as Record<string, unknown>)).error).toMatch(/plain object/)
    expect((await mergeProfileMeta(c, 'p1', null as unknown as Record<string, unknown>)).error).toMatch(/plain object/)
    expect(c.rpc).not.toHaveBeenCalled()
  })

  it('normalizes a non-object row result to {} rather than leaking it', async () => {
    const c = client({ data: null, error: null })
    expect(await mergeProfileMeta(c, 'p1', { x: 1 })).toEqual({ meta: {}, error: null })
  })
})

describe('removeProfileMetaKeys', () => {
  it('calls remove_profile_meta_keys with the named keys', async () => {
    const c = client({ data: { keep: 1 }, error: null })
    const res = await removeProfileMetaKeys(c, 'p1', ['headerFocal', ''])
    expect(c.calls[0][0]).toBe('remove_profile_meta_keys')
    expect(c.calls[0][1]).toEqual({ p_profile_id: 'p1', p_keys: ['headerFocal'] })
    expect(res).toEqual({ meta: { keep: 1 }, error: null })
  })

  it('refuses an empty key list without calling the database, and surfaces an RPC error', async () => {
    const c = client({ data: {}, error: null })
    expect((await removeProfileMetaKeys(c, 'p1', [])).error).toMatch(/at least one key/)
    expect(c.rpc).not.toHaveBeenCalled()
    const bad = client({ data: null, error: { message: 'boom' } })
    expect(await removeProfileMetaKeys(bad, 'p1', ['x'])).toEqual({ meta: null, error: 'boom' })
  })
})

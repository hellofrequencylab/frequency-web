import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ refuse: '', writes: [] as unknown[] }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  let op = 'select'
  const result = () => ({ data: table === 'profiles' ? [{ id: 'buyer', home_timezone: 'UTC' }] : [], error: state.refuse === `${table}:${op}` ? { message: 'practice database unavailable' } : null })
  const builder = { select() { return builder }, in() { return builder },
    upsert(rows: unknown) { op = 'upsert'; state.writes.push(rows); return builder },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve) } }
  return builder
} }) }))
import { adoptPracticesForJourney } from './practices'
beforeEach(() => { state.refuse = ''; state.writes.length = 0 })
describe('paid practice adoption uses checked canonical writes', () => {
  it.each(['profiles:select', 'member_practices:select', 'member_practices:upsert'])('does not checkpoint a failure at %s', async (point) => {
    state.refuse = point
    await expect(adoptPracticesForJourney(['buyer'], ['practice'], 'journey', { strict: true })).rejects.toMatchObject({ message: 'practice database unavailable' })
    state.refuse = ''
    await adoptPracticesForJourney(['buyer'], ['practice'], 'journey', { strict: true })
    expect(state.writes.at(-1)).toEqual([expect.objectContaining({ profile_id: 'buyer', practice_id: 'practice', active: true, source: 'journey', journey_plan_id: 'journey' })])
  })
  it('the ordinary free/cohort path keeps its fail-closed non-throwing contract', async () => {
    state.refuse = 'member_practices:select'
    await expect(adoptPracticesForJourney(['buyer'], ['practice'], 'journey')).resolves.toBeUndefined()
    expect(state.writes).toEqual([])
  })
})

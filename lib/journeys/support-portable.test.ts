import { describe, expect, it } from 'vitest'
import { toPortable, fromPortable, type PortableJourney, type PortableSourceRow } from './portable'
import { automaticallyAdoptsPractice } from './leg-targets'
const plan = { title: 'A rhythm', summary: null, drip_interval_days: 7 }
const support: PortableSourceRow = {
  id: 'practice-block', parent_id: null, block_type: 'practice', sort_order: 0, title: 'A useful walk', required: false,
  settings: { support_suggestion: true, bonus_zaps: 9999, privateNote: 'Never export this', anchor: false },
}

describe('prospective support optionality across portable conversion', () => {
  it('exports only an explicit typed support marker and preserves it when reconstructing blocks', () => {
    const portable = toPortable(plan, [support])
    expect(portable.items).toEqual([{ kind: 'lesson', block_type: 'practice', title: 'A useful walk', note: null, est_minutes: null, required: false, supportSuggestion: true }])
    expect(JSON.stringify(portable)).not.toMatch(/bonus_zaps|privateNote|Never export|anchor|practice-block/)
    const rebuilt = fromPortable(portable).blocks[0]
    expect(rebuilt.settings).toEqual({ support_suggestion: true })
    expect(rebuilt.required).toBe(false)
    // Linking an imported suggestion to a new practice does not silently make it a commitment.
    expect(automaticallyAdoptsPractice(rebuilt)).toBe(false)
    expect(rebuilt).not.toHaveProperty('practice_id')
  })
  it.each([
    { required: false, settings: { support_suggestion: true, anchor: true } },
    { required: true, settings: { support_suggestion: true, anchor: false } },
  ])('preserves automatic participation when the author promoted a suggestion: %j', (promotion) => {
    const source = { ...support, ...promotion }
    expect(automaticallyAdoptsPractice(source)).toBe(true)
    const portable = toPortable(plan, [source])
    expect(portable.items[0]).not.toHaveProperty('supportSuggestion')
    const imported = fromPortable(portable).blocks[0]
    expect(automaticallyAdoptsPractice(imported)).toBe(true)
  })
  it('round-trips repeatedly without dropping optionality or adding settings to old rows', () => {
    const first = toPortable(plan, [support])
    const imported = fromPortable(first).blocks.map((row) => ({ id: row.tempId, parent_id: row.parentTempId, block_type: row.blockType, title: row.title, body: row.body, sort_order: row.sortOrder, required: row.required, est_minutes: row.estMinutes, settings: row.settings }))
    expect(toPortable(plan, imported)).toEqual(first)
    const legacy = toPortable(plan, [{ ...support, settings: null }])
    expect(legacy.items[0]).not.toHaveProperty('supportSuggestion')
    expect(fromPortable(legacy).blocks[0]).not.toHaveProperty('settings')
  })
  it.each(['true', false, 1, {}, null])('does not reconstruct malformed marker %j or arbitrary settings', (value) => {
    const portable = toPortable(plan, [support]) as unknown as { items: Array<Record<string, unknown>> }
    portable.items[0].supportSuggestion = value
    portable.items[0].settings = { anchor: true, extra_credit: true, bonus_zaps: 9999 }
    expect(fromPortable(portable as unknown as PortableJourney).blocks[0]).not.toHaveProperty('settings')
  })
  it('does not attach a support marker to non-practice content even if input carries one', () => {
    const portable = toPortable(plan, [{ ...support, block_type: 'video' }])
    expect(portable.items[0]).not.toHaveProperty('supportSuggestion')
    const attacked = toPortable(plan, [support]) as unknown as { items: Array<Record<string, unknown>> }
    attacked.items[0].block_type = 'video'
    expect(fromPortable(attacked as unknown as PortableJourney).blocks[0]).not.toHaveProperty('settings')
  })
})

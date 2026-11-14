import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRA_CREDIT_ZAPS, extraCreditRow } from './extra-credit'
import { personalJourneyRows, masterWeekRows, masterOnboardingRows, masterCloseRows } from './support-template'

const pillars = { mind: 'mind-id', body: 'body-id', spirit: 'spirit-id', expression: 'expression-id' }

describe('new Journey support suggestions', () => {
  it('starts with one neutral anchor rather than assigning a person to Mind', () => {
    const rows = personalJourneyRows(pillars)
    const practices = rows.filter((row) => row.block_type === 'practice')
    expect(practices).toHaveLength(4)
    expect(practices.filter((row) => row.required)).toHaveLength(1)
    expect(practices[0]).toMatchObject({ domain_id: null, required: true, settings: { anchor: true } })
    expect(practices[0].body).toMatch(/rhythm that fits your life/)
  })
  it('offers all three foundations as optional, removable suggestions', () => {
    const supports = personalJourneyRows(pillars).filter((row) => row.block_type === 'practice' && row.domain_id)
    expect(supports.map((row) => [row.domain_id, row.required])).toEqual([
      ['mind-id', false], ['body-id', false], ['spirit-id', false],
    ])
    for (const row of supports) expect(row.body).toMatch(/replace or remove/)
  })
  it.each([personalJourneyRows, masterWeekRows, masterCloseRows])('allows expression to stay private and optional', (build) => {
    const row = build(pillars).find((row) => row.domain_id === pillars.expression)
    expect(row).toMatchObject({ block_type: 'exercise', required: false, settings: { extra_credit: true } })
    expect(row?.body).toMatch(/private/)
    expect(row?.body).not.toMatch(/one that counts|must share|publicly/)
  })
  it('does not repeat an anchor or require weekly support and reflection quotas', () => {
    const onboarding = masterOnboardingRows(pillars)
    const week = masterWeekRows(pillars)
    expect(onboarding.filter((row) => (row.settings as { anchor?: boolean } | null)?.anchor)).toHaveLength(1)
    expect(week.some((row) => (row.settings as { anchor?: boolean } | null)?.anchor)).toBe(false)
    expect(week.filter((row) => row.block_type === 'practice').every((row) => row.required === false)).toBe(true)
    expect(week.find((row) => row.block_type === 'reflection')?.required).toBe(false)
  })
  it('retains the exact existing optional reward amounts without any grant or completion side effect', () => {
    expect(DEFAULT_EXTRA_CREDIT_ZAPS).toBe(25)
    expect(extraCreditRow('Bonus', 'Do something')).toMatchObject({ required: false, settings: { bonus_zaps: 25, extra_credit: true } })
    expect(masterWeekRows(pillars).find((row) => (row.settings as { extra_credit?: boolean } | null)?.extra_credit)?.settings).toMatchObject({ bonus_zaps: 10 })
    expect(masterCloseRows(pillars).find((row) => (row.settings as { extra_credit?: boolean } | null)?.extra_credit)?.settings).toMatchObject({ bonus_zaps: 25 })
  })
  it('does not mutate supplied taxonomy or share row/settings objects between Journeys', () => {
    const before = structuredClone(pillars)
    const first = personalJourneyRows(pillars)
    first[0].title = 'My authored practice'
    first[0].required = false
    ;(first[0].settings as { anchor: boolean }).anchor = false
    expect(personalJourneyRows(pillars)[0]).toMatchObject({ title: 'Anchor practice', required: true, settings: { anchor: true } })
    expect(pillars).toEqual(before)
  })
  it('handles an incomplete Pillar catalog without inventing IDs or dropping support choices', () => {
    const rows = personalJourneyRows({})
    expect(rows.filter((row) => row.block_type === 'practice')).toHaveLength(4)
    expect(rows.every((row) => row.domain_id === null)).toBe(true)
  })
})

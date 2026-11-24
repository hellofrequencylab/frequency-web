import { describe, expect, it } from 'vitest'
import {
  MAX_REFERENCES,
  extractReferences,
  mentionedProfileIds,
  openMentionQuery,
  plainText,
  referenceToken,
  splitMessage,
} from './references'

const SAM = '0b0e5c2a-1111-4a2b-9c3d-000000000001'
const ALEX = '0b0e5c2a-1111-4a2b-9c3d-000000000002'
const PLAN = '7c1d0000-2222-4b3c-8d4e-000000000003'

describe('extractReferences', () => {
  it('reads people and items by id, in order, once each', () => {
    const body = `@[Sam](profile:${SAM}) can you take #[Spring sound bath](plan:${PLAN})? cc @[Alex](profile:${ALEX}) and @[Sam](profile:${SAM})`
    expect(extractReferences(body)).toEqual([
      { kind: 'profile', id: SAM, label: 'Sam' },
      { kind: 'plan', id: PLAN, label: 'Spring sound bath' },
      { kind: 'profile', id: ALEX, label: 'Alex' },
    ])
    expect(mentionedProfileIds(body)).toEqual([SAM, ALEX])
  })

  it('leaves a bare @handle, a wrong sigil, an unknown kind and a non-UUID as plain text', () => {
    expect(extractReferences('thanks @sam')).toEqual([])
    expect(extractReferences(`#[Sam](profile:${SAM})`)).toEqual([])
    expect(extractReferences(`@[Plan](plan:${PLAN})`)).toEqual([])
    expect(extractReferences(`#[X](invoice:${PLAN})`)).toEqual([])
    expect(extractReferences('@[Sam](profile:not-a-uuid)')).toEqual([])
  })

  it('stops at the cap', () => {
    const many = Array.from({ length: MAX_REFERENCES + 5 }, (_, i) => `@[P${i}](profile:${SAM.slice(0, -2)}${String(i).padStart(2, '0')})`).join(' ')
    expect(extractReferences(many)).toHaveLength(MAX_REFERENCES)
  })
})

describe('referenceToken', () => {
  it('round-trips through extractReferences and drops brackets from the label', () => {
    const token = referenceToken('profile', SAM, 'Sam [the] Rivera')
    expect(token).toBe(`@[Sam the Rivera](profile:${SAM})`)
    expect(extractReferences(`hi ${token}`)).toEqual([{ kind: 'profile', id: SAM, label: 'Sam the Rivera' }])
    expect(referenceToken('plan', PLAN, 'Launch')).toBe(`#[Launch](plan:${PLAN})`)
  })
})

describe('splitMessage and plainText', () => {
  it('splits text around tags and reads them as words', () => {
    const body = `Hi @[Sam](profile:${SAM}), see #[Launch](plan:${PLAN}).`
    expect(splitMessage(body)).toEqual([
      { text: 'Hi ' },
      { ref: { kind: 'profile', id: SAM, label: 'Sam' } },
      { text: ', see ' },
      { ref: { kind: 'plan', id: PLAN, label: 'Launch' } },
      { text: '.' },
    ])
    expect(plainText(body)).toBe('Hi @Sam, see #Launch.')
  })
})

describe('openMentionQuery', () => {
  it('finds the @ word at the caret, and nothing mid-word or after a space', () => {
    expect(openMentionQuery('Thanks @sa', 10)).toEqual({ start: 7, query: 'sa' })
    expect(openMentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(openMentionQuery('mail me at a@b', 14)).toBeNull()
    expect(openMentionQuery('Thanks @sam ', 12)).toBeNull()
  })
})

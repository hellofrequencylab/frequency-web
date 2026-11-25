import { describe, expect, it } from 'vitest'
import { firstUnreadId, isItemSubjectType, threadTopic } from './subjects'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('threadTopic', () => {
  it('names one private topic per thread', () => {
    expect(threadTopic('plan', ID)).toBe(`thread:plan:${ID}`)
    expect(threadTopic('deal', ID.toUpperCase())).toBe(`thread:deal:${ID}`)
  })
  it('refuses an id that is not a uuid', () => {
    expect(threadTopic('event', 'spring-market')).toBeNull()
  })
})

describe('isItemSubjectType', () => {
  it('knows the items that keep their thread in item_comments', () => {
    expect(isItemSubjectType('event')).toBe(true)
    expect(isItemSubjectType('contact')).toBe(true)
    expect(isItemSubjectType('plan')).toBe(false)
    expect(isItemSubjectType(null)).toBe(false)
  })
})

describe('firstUnreadId', () => {
  const msgs = [
    { id: 'a', createdAt: '2026-11-24T10:00:00Z', authorId: 'them' },
    { id: 'b', createdAt: '2026-11-24T11:00:00Z', authorId: 'me' },
    { id: 'c', createdAt: '2026-11-24T12:00:00Z', authorId: 'them' },
  ]
  it('is the first message from someone else after the last read', () => {
    expect(firstUnreadId(msgs, '2026-11-24T10:30:00Z', 'me')).toBe('c')
  })
  it('treats a never-opened thread as new, except my own words', () => {
    expect(firstUnreadId(msgs, null, 'them')).toBe('b')
  })
  it('is null when everything is read', () => {
    expect(firstUnreadId(msgs, '2026-11-24T12:00:00Z', 'me')).toBeNull()
  })
})

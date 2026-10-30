import { describe, expect, it } from 'vitest'
import { personalSection } from './setup-items.ts'

describe('personalSection', () => {
  it('turns the Founder tasks into one Personal group, done only where the task is done', () => {
    const s = personalSection([
      { key: 'post', label: 'Say something', href: '/feed', done: true },
      { key: 'friend', label: 'Make a friend', href: '/people', done: false },
    ])
    expect(s.id).toBe('personal')
    expect(s.items.map((i) => [i.id, i.state, i.href])).toEqual([
      ['f-post', 'done', '/feed'],
      ['f-friend', 'todo', '/people'],
    ])
  })
})

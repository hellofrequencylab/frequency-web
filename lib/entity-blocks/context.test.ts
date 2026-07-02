import { describe, it, expect } from 'vitest'
import { defaultMemberLayout } from './context'
import { entityBlockById } from './registry'

describe('member fresh-default layout', () => {
  it('leads with about, stats, links, topfriends', () => {
    const layout = defaultMemberLayout()
    expect(layout.slice(0, 4)).toEqual(['about', 'stats', 'links', 'topfriends'])
  })

  it('contains only member-supporting blocks, no duplicates', () => {
    const layout = defaultMemberLayout()
    expect(new Set(layout).size).toBe(layout.length)
    for (const id of layout) {
      const block = entityBlockById(id)
      expect(block, `unknown block ${id}`).not.toBeNull()
      expect(block!.kinds).toContain('member')
    }
  })

  it('never includes space-only blocks', () => {
    const layout = defaultMemberLayout()
    for (const id of ['offerings', 'booking', 'events', 'reviews', 'business']) {
      expect(layout).not.toContain(id)
    }
  })
})

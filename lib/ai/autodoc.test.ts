import { describe, it, expect } from 'vitest'
import {
  buildAutodocMessages,
  parseAutodocResponse,
  fallbackItems,
  formatAdvisoryComment,
  AUTODOC_MARKER,
} from './autodoc'

const articles = [
  { category: 'getting-started', slug: 'join-a-circle', title: 'Join a Circle', body: 'How to join.' },
  { category: 'the-game', slug: 'zaps-and-gems', title: 'Zaps & gems', body: 'About zaps.' },
]

describe('buildAutodocMessages', () => {
  it('includes changed files and article bodies', () => {
    const { messages } = buildAutodocMessages(['app/(main)/circles/page.tsx'], articles)
    const text = messages[0].content
    expect(text).toContain('app/(main)/circles/page.tsx')
    expect(text).toContain('getting-started/join-a-circle')
    expect(text).toContain('How to join.')
  })
})

describe('parseAutodocResponse', () => {
  it('parses a JSON array and keeps only known articles', () => {
    const text = `here you go [{"category":"getting-started","slug":"join-a-circle","needsUpdate":true,"note":"cap changed"},{"category":"x","slug":"y","needsUpdate":true,"note":"nope"}]`
    const items = parseAutodocResponse(text, articles)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ slug: 'join-a-circle', needsUpdate: true, note: 'cap changed' })
  })
  it('returns [] on non-JSON', () => {
    expect(parseAutodocResponse('no json here', articles)).toEqual([])
  })
})

describe('fallbackItems', () => {
  it('flags every affected article for manual review', () => {
    const items = fallbackItems(articles)
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.needsUpdate)).toBe(true)
  })
})

describe('formatAdvisoryComment', () => {
  it('carries the marker and a checkbox per flagged article', () => {
    const c = formatAdvisoryComment(
      [
        { category: 'getting-started', slug: 'join-a-circle', needsUpdate: true, note: 'cap changed' },
        { category: 'the-game', slug: 'zaps-and-gems', needsUpdate: false, note: '' },
      ],
      ['app/(main)/circles/page.tsx'],
    )
    expect(c).toContain(AUTODOC_MARKER)
    expect(c).toContain('- [ ] `content/help/getting-started/join-a-circle.md` — cap changed')
    expect(c).toContain('Checked, likely fine: the-game/zaps-and-gems')
  })
  it('says nothing needs updating when nothing is flagged', () => {
    const c = formatAdvisoryComment([{ category: 'a', slug: 'b', needsUpdate: false, note: '' }], [])
    expect(c).toContain('No help articles look like they need an update')
  })
})

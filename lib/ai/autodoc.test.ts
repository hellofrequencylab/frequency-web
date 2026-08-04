import { describe, it, expect } from 'vitest'
import {
  buildAutodocMessages,
  parseAutodocResponse,
  fallbackItems,
  withUnreviewed,
  autodocMaxTokens,
  formatAdvisoryComment,
  AUTODOC_MARKER,
} from './autodoc'

const articles = [
  { category: 'getting-started', slug: 'join-a-circle', title: 'Join a Circle', body: 'How to join.' },
  { category: 'the-quest', slug: 'zaps-and-gems', title: 'Zaps & gems', body: 'About zaps.' },
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
  it('salvages the finished objects from a reply cut short mid-array', () => {
    const text = `[{"category":"getting-started","slug":"join-a-circle","needsUpdate":true,"note":"cap changed"},{"category":"the-quest","slug":"zaps-and`
    const items = parseAutodocResponse(text, articles)
    expect(items).toHaveLength(1)
    expect(items[0].slug).toBe('join-a-circle')
  })
  it('is not fooled by braces inside strings', () => {
    const text = `[{"category":"getting-started","slug":"join-a-circle","needsUpdate":false,"note":"see {this} \\" thing"}]`
    expect(parseAutodocResponse(text, articles)).toHaveLength(1)
  })
})

describe('autodocMaxTokens', () => {
  it('scales with the article count so long lists are not truncated', () => {
    expect(autodocMaxTokens(2)).toBe(800)
    expect(autodocMaxTokens(46)).toBeGreaterThan(5000)
    expect(autodocMaxTokens(500)).toBe(8000)
  })
})

describe('fallbackItems', () => {
  it('lists every affected article without a per-row excuse', () => {
    const items = fallbackItems(articles)
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.note === '')).toBe(true)
  })
})

describe('withUnreviewed', () => {
  it('adds an explicit unchecked row for articles the model skipped', () => {
    const partial = [{ category: 'getting-started', slug: 'join-a-circle', needsUpdate: false, note: '' }]
    const items = withUnreviewed(partial, articles)
    expect(items).toHaveLength(2)
    const missing = items.find((i) => i.slug === 'zaps-and-gems')!
    expect(missing.needsUpdate).toBe(true)
    expect(missing.note).toContain('Not reviewed')
  })
})

describe('formatAdvisoryComment', () => {
  it('carries the marker and a checkbox per flagged article', () => {
    const c = formatAdvisoryComment(
      [
        { category: 'getting-started', slug: 'join-a-circle', needsUpdate: true, note: 'cap changed' },
        { category: 'the-quest', slug: 'zaps-and-gems', needsUpdate: false, note: '' },
      ],
      ['app/(main)/circles/page.tsx'],
    )
    expect(c).toContain(AUTODOC_MARKER)
    expect(c).toContain('- [ ] `content/help/getting-started/join-a-circle.md` — cap changed')
    expect(c).toContain('Checked, likely fine: the-quest/zaps-and-gems')
  })
  it('says nothing needs updating when nothing is flagged', () => {
    const c = formatAdvisoryComment([{ category: 'a', slug: 'b', needsUpdate: false, note: '' }], [])
    expect(c).toContain('No help articles look like they need an update')
  })

  it('leads with ONE outage banner when the review did not run, not a row per article', () => {
    const c = formatAdvisoryComment(fallbackItems(articles), ['app/(main)/circles/page.tsx'], { kind: 'no-key' })
    expect(c).toContain('⚠️ **The AI review did not run.**')
    expect(c).toContain('ANTHROPIC_API_KEY')
    // one statement of the outage, at the top
    expect(c.match(/The AI review did not run/g)).toHaveLength(1)
    // the list is a lookup, not a to-do list
    expect(c).not.toContain('- [ ]')
    expect(c).toContain('<details>')
    expect(c).not.toContain('Vera reviewed the help articles')
  })

  it('names the failure when the model call threw', () => {
    const c = formatAdvisoryComment(fallbackItems(articles), [], { kind: 'call-failed', detail: '401 invalid x-api-key' })
    expect(c).toContain('401 invalid x-api-key')
  })

  it('names AI_DISABLED when AI is switched off on purpose', () => {
    const c = formatAdvisoryComment(fallbackItems(articles), [], { kind: 'ai-disabled' })
    expect(c).toContain('AI_DISABLED')
  })
})

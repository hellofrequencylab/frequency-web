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
  it('recovers a row the model labelled with the article TITLE, not the filename', () => {
    // The exact live failure on PR #2025: content/help/spaces/space-crm.md has
    // `title: Your Space Contacts`, and the model answered `your-space-contacts`. No path or
    // tail rule can bridge that — the two strings share nothing — so every row dropped and the
    // advisory claimed a total outage while the model had actually done the review.
    const withTitleSlug = [
      { category: 'spaces', slug: 'space-crm', title: 'Your Space Contacts', body: 'CRM.' },
    ]
    const text = '```json\n[{"slug":"your-space-contacts","needsUpdate":false,"note":""}]\n```'
    const items = parseAutodocResponse(text, withTitleSlug)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ category: 'spaces', slug: 'space-crm', needsUpdate: false })
  })

  it('refuses a title match when two articles slugify to the same title', () => {
    // A guess that attaches the wrong verdict to the wrong article is worse than "unreviewed".
    const collide = [
      { category: 'a', slug: 'one', title: 'Same Name', body: '' },
      { category: 'b', slug: 'two', title: 'same name', body: '' },
    ]
    expect(parseAutodocResponse('[{"slug":"same-name","needsUpdate":true}]', collide)).toHaveLength(0)
  })

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
    expect(autodocMaxTokens(2)).toBe(1200) // floor
    expect(autodocMaxTokens(46)).toBeGreaterThan(5000)
    expect(autodocMaxTokens(500)).toBe(8000) // ceiling, so cost stays bounded
  })

  it('leaves real headroom per article, not just room for the data', () => {
    // Raised from 120/article after a live 14-article run came back with 9 of 14 "cut short".
    // One verdict is ~30 tokens of keys plus a 200-char note (~50), so ~80 is the floor for the
    // DATA alone; the margin above it is what absorbs a sentence of preamble or fuller notes on
    // a wide diff. Truncation is reported rather than hidden, but a checklist that says "not
    // reviewed" nine times is one nobody reads.
    for (const n of [10, 14, 20]) {
      expect(autodocMaxTokens(n) / n).toBeGreaterThan(200)
    }
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

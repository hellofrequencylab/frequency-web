import { describe, expect, it } from 'vitest'
import { extractFaq } from './content-core.ts'
import { loadCategoriesFromDisk } from './content-core.ts'

// FAQPage is the node AI answer engines lift verbatim, and CONTENT-VOICE §8b requires it on
// "every article with an FAQ". The help centre carried 64 written Q&A pairs and emitted none
// until 2026-09-05. These tests pin BOTH halves: that the extractor is honest about the shape,
// and that the corpus still actually feeds it — a green extractor over zero articles would be
// the "gate that passes by not looking" this repo has been burned by (ADR-970).

describe('extractFaq', () => {
  it('pulls question/answer pairs out of a FAQ section', () => {
    const faq = extractFaq(
      ['# Title', 'Intro prose.', '', '## Questions people ask', '', '### Is it real?', '',
        'Yes it is.', '', '### What does it cost?', '', 'Nothing to join.'].join('\n'),
    )
    expect(faq).toEqual([
      { q: 'Is it real?', a: 'Yes it is.' },
      { q: 'What does it cost?', a: 'Nothing to join.' },
    ])
  })

  it('returns nothing when the article has no FAQ section', () => {
    expect(extractFaq('# Title\n\nSome prose.\n\n## Another section\n\nMore prose.')).toEqual([])
  })

  it('stops at the next top-level section so later prose is never swallowed', () => {
    const faq = extractFaq(
      ['## Questions people ask', '### Q one?', 'A one.', '', '## Next section', '### Not a question',
        'This must not appear.'].join('\n'),
    )
    expect(faq).toEqual([{ q: 'Q one?', a: 'A one.' }])
  })

  it('skips a heading that is not question-shaped rather than guessing', () => {
    const faq = extractFaq(['## FAQ', '### Just a heading', 'Body.', '', '### A real one?', 'Yes.'].join('\n'))
    expect(faq).toEqual([{ q: 'A real one?', a: 'Yes.' }])
  })

  it('strips markdown so the schema carries the words a reader sees', () => {
    const faq = extractFaq(['## FAQ', '### Does it **work**?', 'Yes, see [the guide](/help/x) for `more`.'].join('\n'))
    expect(faq).toEqual([{ q: 'Does it work?', a: 'Yes, see the guide for more.' }])
  })
})

describe('the help corpus still feeds it', () => {
  it('derives FAQ pairs from real articles, and every pair is non-empty', async () => {
    const cats = await loadCategoriesFromDisk()
    const articles = cats.flatMap((c) => c.articles)
    const withFaq = articles.filter((a) => a.faq.length > 0)

    // FLOOR, not an exact count: articles may gain an FAQ, and that is good. It may not silently
    // drop to zero, which is what a broken extractor or a renamed heading would look like.
    expect(articles.length).toBeGreaterThanOrEqual(50)
    expect(withFaq.length).toBeGreaterThanOrEqual(10)
    expect(withFaq.reduce((n, a) => n + a.faq.length, 0)).toBeGreaterThanOrEqual(40)

    for (const a of withFaq) {
      for (const { q, a: answer } of a.faq) {
        expect(q.endsWith('?'), `${a.slug}: question must be question-shaped: ${q}`).toBe(true)
        expect(answer.length, `${a.slug}: empty answer for ${q}`).toBeGreaterThan(20)
        expect(answer, `${a.slug}: markdown leaked into the schema for ${q}`).not.toMatch(/[*`]|\]\(/)
      }
    }
  })
})

import { describe, it, expect } from 'vitest'
import { buildHelpMessages, toCitations, HELP_SYSTEM } from './help-rag'

const chunk = (category: string, slug: string, heading = '', content = 'body') => ({
  category,
  slug,
  heading,
  content,
  similarity: 0.9,
})

describe('buildHelpMessages', () => {
  it('uses the grounded Vera system prompt', () => {
    const { system } = buildHelpMessages('q', [chunk('a', 'b')])
    expect(system).toBe(HELP_SYSTEM)
  })

  it('embeds the question and every chunk into one user message', () => {
    const { messages } = buildHelpMessages('how do I join a circle', [
      chunk('groups', 'hubs', 'Hubs', 'hub content'),
      chunk('getting-started', 'join-a-circle', '', 'join content'),
    ])
    expect(messages).toHaveLength(1)
    const text = messages[0].content
    expect(text).toContain('how do I join a circle')
    expect(text).toContain('hub content')
    expect(text).toContain('join content')
    expect(text).toContain('[1]')
    expect(text).toContain('[2]')
  })
})

describe('toCitations', () => {
  it('dedupes to one citation per source article, in order', () => {
    const cites = toCitations([
      { category: 'groups', slug: 'hubs', heading: 'Hubs' },
      { category: 'groups', slug: 'hubs', heading: 'Other section' }, // same article
      { category: 'getting-started', slug: 'join-a-circle', heading: '' },
    ])
    expect(cites).toHaveLength(2)
    expect(cites[0]).toMatchObject({ category: 'groups', slug: 'hubs' })
    expect(cites[1]).toMatchObject({ category: 'getting-started', slug: 'join-a-circle' })
  })

  it('builds a help href for each citation', () => {
    const [c] = toCitations([{ category: 'safety', slug: 'reporting', heading: '' }])
    expect(c.href).toBe('/help/safety/reporting')
  })

  it('returns [] for no chunks', () => {
    expect(toCitations([])).toEqual([])
  })
})

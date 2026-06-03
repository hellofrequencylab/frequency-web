import { describe, it, expect } from 'vitest'
import { contentDraftItems, dedupeByHook, type ContentDraftItem } from './content'
import type { MarketRead } from './market-read'

const read: MarketRead = {
  signal: {
    totalMembers: 0, newThisWeek: 0, newWithoutCircle: 0, quietMembers: 0,
    engagementThisWeek: 0, engagementPriorWeek: 0, topInterest: null,
  },
  generatedAt: '2026-06-03T00:00:00Z',
  painPoints: [
    {
      id: 'p1', title: 'Unseen', ache: 'No one notices', evidence: '12 quiet members', basis: 'live', persona: 'HFL',
      ideas: [
        { channel: 'Social', hook: 'You were missed', body: 'Come back.' },
        { channel: 'Ad', hook: 'The exhale', body: 'Home.' },
      ],
    },
  ],
}

describe('contentDraftItems', () => {
  it('flattens pain points × ideas into proposable drafts with rationale', () => {
    const items = contentDraftItems(read)
    expect(items).toHaveLength(2)
    expect(items[0].payload).toEqual({ channel: 'Social', hook: 'You were missed', body: 'Come back.', painPoint: 'Unseen' })
    expect(items[0].rationale).toBe('No one notices — 12 quiet members')
  })
})

describe('dedupeByHook', () => {
  const items: ContentDraftItem[] = contentDraftItems(read)
  it('drops hooks already pending', () => {
    expect(dedupeByHook(items, ['You were missed'])).toHaveLength(1)
    expect(dedupeByHook(items, ['You were missed'])[0].payload.hook).toBe('The exhale')
  })
  it('drops duplicate hooks within the batch', () => {
    expect(dedupeByHook([...items, ...items], [])).toHaveLength(2)
  })
  it('keeps everything when nothing matches', () => {
    expect(dedupeByHook(items, [])).toHaveLength(2)
  })
})

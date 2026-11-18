import { describe, it, expect } from 'vitest'
import { filterJourneysByOnly } from './profile'
import type { SpacePracticeItem } from '@/lib/spaces/content-data'

const j = (title: string, category: string | null = null): SpacePracticeItem => ({
  kind: 'journey',
  id: title,
  slug: title.toLowerCase().replace(/\s+/g, '-'),
  title,
  summary: null,
  emoji: null,
  adoptCount: 0,
  category,
})

const all = [j('The Business of Community 101', 'Creator Lab'), j('Host Foundations', 'Hosting'), j('Mens Work Intro')]

describe('SpacePractices `only` filter', () => {
  it('keeps everything when blank', () => {
    expect(filterJourneysByOnly(all, '')).toHaveLength(3)
    expect(filterJourneysByOnly(all, undefined)).toHaveLength(3)
  })

  it('still matches a word in the title', () => {
    expect(filterJourneysByOnly(all, 'mens').map((x) => x.title)).toEqual(['Mens Work Intro'])
  })

  it('matches a category exactly, ignoring case', () => {
    expect(filterJourneysByOnly(all, 'creator lab').map((x) => x.title)).toEqual(['The Business of Community 101'])
    expect(filterJourneysByOnly(all, 'Hosting').map((x) => x.title)).toEqual(['Host Foundations'])
  })
})

import { describe, it, expect } from 'vitest'
import { withEffectiveDataContent } from './effective-block-content'
import type { SpaceContentData } from './content-data'

// A minimal SpaceContentData with just the fields the About / Story fallbacks read; the rest are empty so
// the helper never touches them.
function data(partial: Partial<SpaceContentData>): SpaceContentData {
  return {
    spaceId: 's1',
    aboutShort: '',
    updates: [],
    reviews: { rating: null, count: 0, items: [] } as unknown as SpaceContentData['reviews'],
    faqs: [],
    ...partial,
  } as SpaceContentData
}

describe('withEffectiveDataContent', () => {
  it('returns the persisted map unchanged when there is no data (editor / member Spotlight)', () => {
    const content = { story: { body: 'authored' } }
    expect(withEffectiveDataContent(content, null)).toEqual(content)
    expect(withEffectiveDataContent(content, undefined)).toEqual(content)
  })

  it('pre-fills the Story body from data.profile.about when the authored bag is empty', () => {
    const out = withEffectiveDataContent({}, data({ profile: { about: 'The longer story.' } }))
    expect(out.story).toEqual({ eyebrow: 'About', title: 'Our story', body: 'The longer story.' })
  })

  it('pre-fills the About body from data.aboutShort when the authored bag is empty', () => {
    const out = withEffectiveDataContent({}, data({ aboutShort: 'A short intro.' }))
    expect(out.about).toEqual({ eyebrow: 'About', title: 'About this space', body: 'A short intro.' })
  })

  it('keeps an authored override and never clobbers it with the fallback', () => {
    const out = withEffectiveDataContent(
      { story: { body: 'My own words.', title: 'Where we began' } },
      data({ profile: { about: 'The central story.' } }),
    )
    expect(out.story).toEqual({
      eyebrow: 'About', // pre-filled default (was blank)
      title: 'Where we began', // authored — kept
      body: 'My own words.', // authored — kept, NOT the central story
    })
  })

  it('still pre-fills the default eyebrow / title even when there is no central body', () => {
    const out = withEffectiveDataContent({}, data({}))
    // No central prose, but the header defaults still populate so the fields are not blank.
    expect(out.about).toEqual({ eyebrow: 'About', title: 'About this space' })
    expect(out.story).toEqual({ eyebrow: 'About', title: 'Our story' })
  })

  it('leaves unrelated blocks untouched', () => {
    const content = { offerings: { eyebrow: 'Book' }, callout: { title: 'Hi' } }
    const out = withEffectiveDataContent(content, data({ aboutShort: 'x' }))
    expect(out.offerings).toBe(content.offerings)
    expect(out.callout).toBe(content.callout)
  })

  it('does not treat a whitespace-only authored value as an override', () => {
    const out = withEffectiveDataContent({ story: { body: '   ' } }, data({ profile: { about: 'Real story.' } }))
    expect(out.story?.body).toBe('Real story.')
  })
})

import { describe, expect, it } from 'vitest'
import { readLaunchDraft } from './launch-draft'

describe('readLaunchDraft (SCAN-1219)', () => {
  it('reads what Publish kept', () => {
    expect(readLaunchDraft({ launchDraft: { website: { headline: 'H', intro: 'I' }, email: { subject: 'S', body: 'B' }, emailCampaignId: 'abc' } })).toEqual({
      website: { headline: 'H', intro: 'I' },
      email: { subject: 'S', body: 'B' },
      emailCampaignId: 'abc',
    })
  })

  it('reads junk as nothing kept', () => {
    const empty = { website: { headline: '', intro: '' }, email: { subject: '', body: '' }, emailCampaignId: '' }
    for (const v of [null, undefined, 3, [], { launchDraft: 'x' }, { launchDraft: { website: [], email: 4 } }]) expect(readLaunchDraft(v)).toEqual(empty)
  })
})

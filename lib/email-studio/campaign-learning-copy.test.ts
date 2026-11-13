import { describe, expect, it } from 'vitest'
import { buildCampaignLearningCopy } from './campaign-learning-copy'
import { sanitizeEntityLayout } from '@/lib/entity-blocks/layout'
import { lintVoice } from './voice-lint'

const input = {
  strategy: 'personal_preview' as const,
  targetCampaignId: '85ca4b8c-1cee-46d5-a092-499f54e8600e',
  fromName: 'Daniel',
  siteUrl: 'https://frequencylocal.com',
}

describe('reviewed campaign learning copy', () => {
  it('repairs the personal invitation journey with a real public browse destination and stable attribution', () => {
    const copy = buildCampaignLearningCopy({ ...input, acknowledgeMismatch: true })
    const destination = new URL(copy.destination)
    expect(destination.pathname).toBe('/events')
    expect(Object.fromEntries(destination.searchParams)).toEqual({
      utm_source: 'frequency', utm_medium: 'email', utm_campaign: input.targetCampaignId, utm_content: 'community_preview',
    })
    expect(copy.body).toContain('last email')
    expect(copy.body).toContain('build a Space')
    expect(copy.body).toContain("You don't need to build anything")
    expect(copy.layout.content?.button.label).toBe('See the gatherings')
    expect(copy.layout.content?.button.url).toBe(copy.destination)
    expect(copy.replyMode).toBe('conversation')
    expect(copy.fromName).toBe('Daniel')
  })
  it('does not invent prior correspondence or a mismatch when none was verified', () => {
    const copy = buildCampaignLearningCopy(input)
    expect(copy.body).not.toContain('last email')
    expect(copy.body).not.toContain('the link asked you')
    expect(copy.body).toContain('I wanted to make it easy to have a look around Frequency.')
    expect(copy.changes.join(' ')).toContain('without assuming prior contact')
  })
  it('uses a distinct host follow-up only when the caller explicitly selects that strategy', () => {
    const copy = buildCampaignLearningCopy({ ...input, strategy: 'host_followup' })
    const destination = new URL(copy.destination)
    expect(destination.pathname).toBe('/create-a-space')
    expect(destination.searchParams.get('utm_content')).toBe('host_followup')
    expect(copy.body).not.toContain('last email')
    expect(copy.body).toContain('Review what you enter before choosing your next step.')
    expect(copy.body).not.toContain('You said')
    expect(copy.body).not.toMatch(/private|until you.*activate|publish/i)
    expect(copy.changes.some((c) => c.includes('host intent'))).toBe(true)
  })
  it('is deterministic, uses native-compatible email blocks and invents no event, date, price, video or history', () => {
    const copy = buildCampaignLearningCopy(input)
    expect(buildCampaignLearningCopy(input)).toEqual(copy)
    expect(sanitizeEntityLayout(copy.layout, 'email')).not.toBeNull()
    expect(lintVoice([copy.subject, copy.preheader, copy.body].join('\n')).violations).toEqual([])
    expect(copy.body).not.toMatch(/January|November|Tuesday|Friday|\$|video|five years|5 years|heal|guarantee/i)
    expect(copy.changes.length).toBeGreaterThan(0)
  })
  it('escapes optional names in rich email prose while retaining a plain-text body', () => {
    const copy = buildCampaignLearningCopy({ ...input, firstName: '<Sam & Jo>' })
    expect(copy.body).toContain('Hi <Sam & Jo>,')
    expect(copy.layout.content?.prose.text).toContain('Hi &lt;Sam &amp; Jo&gt;,')
    expect(copy.layout.content?.prose.text).not.toContain('<Sam')
  })
  it('rejects invalid strategy, unsafe destinations, missing sender names and malformed campaign IDs', () => {
    expect(() => buildCampaignLearningCopy({ ...input, strategy: 'invented' as never })).toThrow()
    expect(() => buildCampaignLearningCopy({ ...input, siteUrl: 'javascript:alert(1)' })).toThrow()
    expect(() => buildCampaignLearningCopy({ ...input, siteUrl: 'https://user:secret@frequencylocal.com' })).toThrow()
    expect(() => buildCampaignLearningCopy({ ...input, fromName: ' ' })).toThrow()
    expect(() => buildCampaignLearningCopy({ ...input, targetCampaignId: '../other' })).toThrow()
  })
})

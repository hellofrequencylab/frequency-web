import { describe, it, expect } from 'vitest'
import { CONTACT_TOPICS } from '@/lib/comms/contact-preferences'
import { EMAIL_TOPIC_OPTIONS, DEFAULT_EMAIL_TOPIC, normalizeEmailTopic } from './email-topics'

describe('normalizeEmailTopic (ADR-799 C)', () => {
  it('passes through each valid contact topic', () => {
    expect(normalizeEmailTopic('marketing')).toBe('marketing')
    expect(normalizeEmailTopic('events')).toBe('events')
    expect(normalizeEmailTopic('dispatches')).toBe('dispatches')
  })

  it('defaults to marketing for absent / invalid input (back-compat)', () => {
    expect(normalizeEmailTopic(undefined)).toBe('marketing')
    expect(normalizeEmailTopic(null)).toBe('marketing')
    expect(normalizeEmailTopic('')).toBe('marketing')
    expect(normalizeEmailTopic('nonsense')).toBe('marketing')
    expect(normalizeEmailTopic(42)).toBe('marketing')
    expect(DEFAULT_EMAIL_TOPIC).toBe('marketing')
  })
})

describe('EMAIL_TOPIC_OPTIONS', () => {
  it('offers exactly the three contact topics (no invented keys)', () => {
    const keys = EMAIL_TOPIC_OPTIONS.map((o) => o.key)
    expect(new Set(keys)).toEqual(new Set(CONTACT_TOPICS))
    expect(keys).toHaveLength(CONTACT_TOPICS.length)
  })

  it('every option has a sentence-case label + help, and no em/en dashes (voice canon)', () => {
    for (const o of EMAIL_TOPIC_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0)
      expect(o.help.length).toBeGreaterThan(0)
      expect(o.label).not.toMatch(/[—–]/)
      expect(o.help).not.toMatch(/[—–]/)
      // Sentence case: not Title Case (no interior capitalized second word like "Event Update").
      expect(o.label).not.toMatch(/^\w+ [A-Z]/)
    }
  })

  it('the default topic is one of the options', () => {
    expect(EMAIL_TOPIC_OPTIONS.some((o) => o.key === DEFAULT_EMAIL_TOPIC)).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { listEntryTemplates, getEntryTemplate, isEntryTemplateId } from './templates'
import { isValidEntryDestination, entryDestinationGroups, leadFlowPath } from './destinations'

describe('entry-point templates', () => {
  it('exposes the five goal-typed templates', () => {
    expect(listEntryTemplates()).toHaveLength(5)
  })
  it('falls back to the event template for unknown ids', () => {
    expect(getEntryTemplate('nope').id).toBe('event')
    expect(getEntryTemplate(null).id).toBe('event')
    expect(isEntryTemplateId('partner')).toBe(true)
    expect(isEntryTemplateId('nope')).toBe(false)
  })
  it('does not declare a flyer layout after LIVE-216', () => {
    for (const t of listEntryTemplates()) {
      expect(t).not.toHaveProperty('flyerLayout')
    }
  })
})

describe('entry destinations', () => {
  it('accepts known lead flows, circle/event paths, and curated pages', () => {
    expect(isValidEntryDestination(leadFlowPath('welcome'))).toBe(true)
    expect(isValidEntryDestination('/start/partner')).toBe(true)
    expect(isValidEntryDestination('/circles/sunrise-yoga')).toBe(true)
    expect(isValidEntryDestination('/events/full-moon')).toBe(true)
    expect(isValidEntryDestination('/discover')).toBe(true)
  })
  it('rejects unknown lead flows, arbitrary paths, and external urls', () => {
    expect(isValidEntryDestination('/start/not-a-flow')).toBe(false)
    expect(isValidEntryDestination('/random/page')).toBe(false)
    expect(isValidEntryDestination('https://evil.example.com')).toBe(false)
    expect(isValidEntryDestination('')).toBe(false)
  })
  it('always offers the lead-flow group, even with no member targets', () => {
    const groups = entryDestinationGroups([])
    expect(groups[0].group).toMatch(/lead flow/i)
    expect(groups[0].items.length).toBeGreaterThan(0)
  })
})

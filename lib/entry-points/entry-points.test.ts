import { describe, it, expect } from 'vitest'
import { listEntryTemplates, getEntryTemplate, isEntryTemplateId } from './templates'
import { isValidEntryDestination, entryDestinationGroups, leadFlowPath } from './destinations'
import { buildEntryFlyerSvg } from './flyer'

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

describe('flyer composer', () => {
  it('builds a vector SVG carrying the headline + footer and an embedded QR', () => {
    const svg = buildEntryFlyerSvg({
      layout: 'poster',
      slots: { headline: 'Full Moon Hike', subhead: 'Friday at the bluff', footer: 'Scan to join' },
      url: 'https://hellofrequency.app/q/abc123',
      shortLabel: 'hellofrequency.app/q/abc123',
    })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('FULL MOON HIKE') // headline is uppercased
    expect(svg).toContain('Scan to join')
    // The embedded QR contributes <rect> modules.
    expect(svg).toContain('<rect')
  })
  it('wraps a medium subhead across lines without truncating it', () => {
    const svg = buildEntryFlyerSvg({
      layout: 'poster',
      slots: { headline: 'Event', subhead: 'Friday 7pm at Torrey Pines bluff, bring a layer', footer: 'Scan' },
      url: 'https://hellofrequency.app/q/abc123',
    })
    expect(svg).toContain('layer') // last word survives
    expect(svg).not.toContain('…') // nothing ellipsized at this length
  })

  it('supports the card layout too', () => {
    const svg = buildEntryFlyerSvg({
      layout: 'card',
      slots: { headline: 'Join me', subhead: 'Real community nearby', footer: 'Scan' },
      url: 'https://hellofrequency.app/q/xyz789',
    })
    expect(svg).toContain('<svg')
    expect(svg).toContain('JOIN ME')
  })
})

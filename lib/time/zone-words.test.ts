import { describe, expect, it } from 'vitest'
import { UNKNOWN_ZONE_WORDS, ZONE_CHOICES, zoneWords } from './zone-words'

// THE WORDS A PERSON READS FOR A ZONE (LIVE-471). The row's ask in one line: "Pacific Time", not
// "America/Los_Angeles", and never a raw identifier where a place name is available.

describe('zoneWords', () => {
  it('names the house zone in plain words', () => {
    expect(zoneWords('America/Los_Angeles')).toBe('Pacific Time')
  })

  it('gives the same words in July and in December, because a Space zone does not move with the clocks', () => {
    // Not a date test: the helper takes no date at all, which is the point. Intl would say "Pacific
    // Daylight Time" in one half of the year and "Pacific Standard Time" in the other.
    expect(zoneWords('America/Los_Angeles')).toBe(zoneWords('America/Los_Angeles'))
    expect(zoneWords('America/Los_Angeles')).not.toMatch(/Daylight|Standard|PDT|PST/)
  })

  it('names the zones an operator is most likely to be in', () => {
    expect(zoneWords('America/New_York')).toBe('Eastern Time')
    expect(zoneWords('America/Chicago')).toBe('Central Time')
    expect(zoneWords('America/Denver')).toBe('Mountain Time')
    expect(zoneWords('Europe/London')).toBe('UK Time')
    expect(zoneWords('Europe/Berlin')).toBe('Central European Time')
    expect(zoneWords('Asia/Tokyo')).toBe('Japan Time')
    expect(zoneWords('Australia/Sydney')).toBe('Eastern Australia Time')
  })

  it('spells UTC out rather than shouting three letters', () => {
    expect(zoneWords('UTC')).toBe('Coordinated Universal Time')
    expect(zoneWords('Etc/UTC')).toBe('Coordinated Universal Time')
  })

  it('falls back to the zone OWN CITY, not the raw identifier, when it has no named words', () => {
    expect(zoneWords('Asia/Kathmandu')).toBe('Kathmandu Time')
    expect(zoneWords('America/Argentina/Ushuaia')).toBe('Ushuaia Time')
    // The underscore is a file-format detail, never something a person should read.
    expect(zoneWords('Pacific/Port_Moresby')).toBe('Port Moresby Time')
    expect(zoneWords('Asia/Kathmandu')).not.toContain('/')
    expect(zoneWords('Pacific/Port_Moresby')).not.toContain('_')
  })

  it('says Local time only when the value is not a zone at all', () => {
    expect(zoneWords(null)).toBe(UNKNOWN_ZONE_WORDS)
    expect(zoneWords(undefined)).toBe(UNKNOWN_ZONE_WORDS)
    expect(zoneWords('')).toBe(UNKNOWN_ZONE_WORDS)
    expect(zoneWords('   ')).toBe(UNKNOWN_ZONE_WORDS)
    expect(zoneWords('not a zone!')).toBe(UNKNOWN_ZONE_WORDS)
    expect(zoneWords('America/Los Angeles')).toBe(UNKNOWN_ZONE_WORDS)
    expect(zoneWords('2026/09/23')).toBe(UNKNOWN_ZONE_WORDS)
  })

  it('never returns an empty string and never prints a raw identifier', () => {
    for (const input of ['America/Los_Angeles', 'Asia/Kathmandu', 'nonsense', '', 'UTC']) {
      const out = zoneWords(input)
      expect(out.length).toBeGreaterThan(0)
      expect(out).not.toBe(input)
    }
  })
})

describe('ZONE_CHOICES (the settings menu)', () => {
  it('offers each set of words exactly once', () => {
    const labels = ZONE_CHOICES.map((c) => c.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('reads in the order it is shown', () => {
    const labels = ZONE_CHOICES.map((c) => c.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  })

  it('every choice round-trips through the words helper', () => {
    for (const choice of ZONE_CHOICES) expect(zoneWords(choice.value)).toBe(choice.label)
  })

  it('carries the house zone, so a Space can always pick the one it probably wants', () => {
    expect(ZONE_CHOICES.some((c) => c.value === 'America/Los_Angeles')).toBe(true)
  })
})

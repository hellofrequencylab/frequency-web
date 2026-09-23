import { describe, expect, it } from 'vitest'
import { headerZone } from './header-zone'
import { UNKNOWN_ZONE_WORDS } from './zone-words'

// WHOSE ZONE THE CONSOLE HEADER NAMES (LIVE-471). The console used to name the viewer's zone as an
// abbreviation, so an operator in an airport read the airport over a calendar their team keeps
// somewhere else. The words the header renders are pinned by
// components/spaces/calendar-workspace.render.test.tsx; this file pins the decision behind them.

describe('headerZone', () => {
  it('names the SPACE zone when the Space has said one, whoever is reading', () => {
    const zone = headerZone('America/Los_Angeles', 'Europe/Lisbon')
    expect(zone.words).toBe('Pacific Time')
    expect(zone.name).toBe('America/Los_Angeles')
    expect(zone.isSpaceZone).toBe(true)
  })

  it('names the viewer zone, and says it is the viewer zone, when the Space has never said', () => {
    const zone = headerZone(null, 'Europe/Lisbon')
    expect(zone.words).toBe('Western European Time')
    expect(zone.name).toBe('Europe/Lisbon')
    expect(zone.isSpaceZone).toBe(false)
  })

  it('treats a blank or whitespace Space value as never said, the way newDateZone does', () => {
    for (const notSaid of ['', '   ', null, undefined]) {
      expect(headerZone(notSaid, 'Europe/Lisbon').isSpaceZone).toBe(false)
      expect(headerZone(notSaid, 'Europe/Lisbon').words).toBe('Western European Time')
    }
  })

  it('says Local time when neither the Space nor the viewer can say', () => {
    const zone = headerZone(null, '')
    expect(zone.words).toBe(UNKNOWN_ZONE_WORDS)
    expect(zone.name).toBe('')
    expect(zone.isSpaceZone).toBe(false)
  })

  it('never prints a raw identifier', () => {
    for (const tz of ['America/Los_Angeles', 'Asia/Kathmandu', 'Pacific/Port_Moresby']) {
      expect(headerZone(tz, null).words).not.toContain('/')
      expect(headerZone(tz, null).words).not.toContain('_')
    }
  })
})

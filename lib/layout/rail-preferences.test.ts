import { describe, expect, it } from 'vitest'
import { decodeRailPreferences } from './rail-preferences'

describe('rail preference reload', () => {
  it('leaves fresh and invalid storage on asymmetric server/CSS defaults', () => {
    for (const raw of [null, 'bad', '[]', '{}']) {
      expect(decodeRailPreferences(raw)).toEqual({ l: null, r: null, lc: null, rc: null })
    }
  })
  it('keeps both independently resized widths and collapse choices after reload', () => {
    expect(decodeRailPreferences(JSON.stringify({ l: 230, r: 310, lc: true, rc: false })))
      .toEqual({ l: 230, r: 310, lc: true, rc: false })
  })
  it('does not turn a left-only saved resize into a narrow right rail', () => {
    expect(decodeRailPreferences('{"l":240}')).toMatchObject({ l: 240, r: null })
  })
  it('migrates a legacy shared resize without forcing equality and bounds corrupt dimensions', () => {
    expect(decodeRailPreferences('{"w":270}')).toMatchObject({ l: 270, r: null })
    expect(decodeRailPreferences('{"l":5,"r":900,"lc":"yes"}')).toEqual({ l: 220, r: 320, lc: null, rc: null })
  })
})

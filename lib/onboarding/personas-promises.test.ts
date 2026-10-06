// LIVE-793 (ADR-1715): A PERSONA PROMISES ONLY WHAT IS BUILT, AND ITS LABEL DOES NOT COLLIDE WITH
// THE BUILDERS FAMILY.
//
// The Partner reel promised a loyalty rewards program and gamified foot traffic, neither of which
// exists. The "Community builder" label collided with the Builders family in CONTENT-VOICE §2f
// (the people who run a Space). The Practitioner track linked to /the-quest, a member path, not
// the place a practitioner learns how a Space works.

import { describe, expect, it } from 'vitest'
import { listPersonas, PERSONAS } from './personas'

const copyOf = (p: (typeof PERSONAS)[keyof typeof PERSONAS]) =>
  [p.label, p.pitch, ...p.reel.flatMap((r) => [JSON.stringify(r)]), p.track.headline, ...p.track.shows].join(' \n ')

describe('persona promises (LIVE-793)', () => {
  it('no persona promises loyalty rewards or gamified foot traffic', () => {
    for (const p of listPersonas()) {
      expect(copyOf(p), p.id).not.toMatch(/loyalty|gamified/i)
    }
    expect(copyOf(PERSONAS.partner)).not.toMatch(/loyalty|gamified/i)
  })

  it('the organizer persona is not labelled with the Builders family name', () => {
    expect(PERSONAS.builder.label).toBe('Host or organizer')
    expect(PERSONAS.builder.marketingTag).toBe('persona_builder')
  })

  it('the Practitioner track points at a Space door, not the member Quest', () => {
    expect(PERSONAS.practitioner.track.learnMoreHref).not.toBe('/the-quest')
    expect(PERSONAS.practitioner.track.learnMoreHref).toMatch(/^\/(for\/|spaces)/)
  })
})

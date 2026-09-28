import { describe, expect, it } from 'vitest'
import { spaceFrontDoor, type SpaceViewer } from './front-door'

const VIEWERS: SpaceViewer[] = ['anonymous', 'visitor', 'waitlist', 'member']

const base = { brandName: 'Royal Temple', spaceSlug: 'royaltemple', tierCount: 2 }

describe('the Space front door says something true to each reader', () => {
  // 🔴 THE POINT OF THE ROW. Before this, Home said the same thing to everybody: the public tree
  // closed with a generic sign-in card naming nothing the Space sells, and the member tree closed
  // with nothing at all. Each of these is a sentence Home never said.
  it('gives every viewer state a heading and a body, or an honest null', () => {
    for (const viewer of VIEWERS) {
      const door = spaceFrontDoor({ ...base, viewer })
      expect(door, viewer).not.toBeNull()
      expect(door!.title.length, viewer).toBeGreaterThan(0)
      expect(door!.body.length, viewer).toBeGreaterThan(0)
    }
  })

  // docs/CONTENT-VOICE.md: no em dashes in member-facing copy.
  it('carries no em dash', () => {
    for (const viewer of VIEWERS) {
      const d = spaceFrontDoor({ ...base, viewer })!
      for (const s of [d.title, d.body, d.action?.label ?? '']) expect(s, viewer).not.toContain('—')
    }
  })

  it('sends a member to the conversation, which is where a Space actually lives', () => {
    const d = spaceFrontDoor({ ...base, viewer: 'member' })!
    expect(d.action?.href).toBe('/spaces/royaltemple/circles#discussion')
  })

  // The two join arms must reach the surface that lists the tiers and takes the money, never Home
  // (which is the page this card sits on) and never /book (LIVE-509's probe forbids that).
  it('sends both join arms to the Memberships tab', () => {
    for (const viewer of ['anonymous', 'visitor'] as SpaceViewer[]) {
      expect(spaceFrontDoor({ ...base, viewer })!.action?.href, viewer).toBe('/spaces/royaltemple/memberships')
    }
  })

  // HONEST EMPTY. A Space that sells nothing gets no sales pitch, which is what lets the public page
  // fall back to its sign-in card and the member page render nothing rather than a heading over air.
  it('says nothing about memberships on a Space that publishes none', () => {
    expect(spaceFrontDoor({ ...base, viewer: 'anonymous', tierCount: 0 })).toBeNull()
    expect(spaceFrontDoor({ ...base, viewer: 'visitor', tierCount: 0 })).toBeNull()
  })

  // ...but the two states that are ABOUT standing, not about selling, survive a tier count of zero:
  // a member is still a member of a Space that has stopped selling.
  it('still speaks to a member and a waitlist at zero tiers', () => {
    expect(spaceFrontDoor({ ...base, viewer: 'member', tierCount: 0 })).not.toBeNull()
    expect(spaceFrontDoor({ ...base, viewer: 'waitlist', tierCount: 0 })).not.toBeNull()
  })

  it('never re-pitches a membership to someone already on the waitlist', () => {
    const d = spaceFrontDoor({ ...base, viewer: 'waitlist' })!
    expect(d.action).toBeNull()
    expect(d.title.toLowerCase()).not.toContain('become a member')
    expect(d.body.toLowerCase()).not.toContain('join')
  })

  // The anonymous render has NO viewer (ADR-1526), so it cannot know whether the reader is already
  // a member. Its copy must therefore be true for a member reading it too: it describes the Space,
  // it does not tell the reader what they are.
  it('makes no claim about the reader on the anonymous path', () => {
    const d = spaceFrontDoor({ ...base, viewer: 'anonymous' })!
    for (const claim of ['you are not', 'not a member', 'sign in', 'become a member']) {
      expect(d.title.toLowerCase() + ' ' + d.body.toLowerCase(), claim).not.toContain(claim)
    }
  })

  it('names the Space when it knows it, and stays readable when it does not', () => {
    expect(spaceFrontDoor({ ...base, viewer: 'member' })!.title).toContain('Royal Temple')
    const anon = spaceFrontDoor({ ...base, viewer: 'member', brandName: '   ' })!
    expect(anon.title).toContain('this Space')
    expect(anon.title).not.toContain('null')
  })
})

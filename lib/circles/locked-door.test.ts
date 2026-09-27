import { describe, expect, it } from 'vitest'
import { circleDoor, type CircleDoorInput } from './locked-door'
import { CIRCLE_ACCESS_MODES, canJoinCircle, type CircleJoinReason } from './visibility'

const REASONS: CircleJoinReason[] = [
  'signed-out',
  'invite-only',
  'space-members-only',
  'membership-only',
  'paid',
  'closed',
]

const base: Omit<CircleDoorInput, 'reason'> = {
  circleSlug: 'temple-moon',
  spaceSlug: 'royaltemple',
  spaceName: 'Royal Temple',
}

describe('every refusal a viewer can hit has a door', () => {
  // 🔴 THE POINT OF THE ROW. Before this, a viewer who could not enter got an empty room: the
  // roster was blanked and `canEnter` was dropped by every consumer. Each of these is a sentence
  // that room never said.
  it('names the wall and never says access denied', () => {
    for (const reason of REASONS) {
      const door = circleDoor({ ...base, reason })
      expect(door.title.length, reason).toBeGreaterThan(0)
      expect(door.body.length, reason).toBeGreaterThan(0)
      expect(door.title.toLowerCase(), reason).not.toContain('denied')
      expect(door.title.toLowerCase(), reason).not.toContain('forbidden')
    }
  })

  // docs/CONTENT-VOICE.md: no em dashes in member-facing copy.
  it('carries no em dash', () => {
    for (const reason of REASONS) {
      const { title, body, action } = circleDoor({ ...base, reason })
      for (const s of [title, body, action?.label ?? '']) expect(s, reason).not.toContain('—')
    }
  })

  // A guard against the arm this file exists to prevent: the two PAID reasons must send the
  // reader to the surface that actually sells the thing, not to the Space's front page.
  it('sends both paid doors to the Space memberships tab', () => {
    for (const reason of ['membership-only', 'paid'] as CircleJoinReason[]) {
      expect(circleDoor({ ...base, reason }).action?.href, reason).toBe('/spaces/royaltemple/memberships')
    }
  })

  it('offers no self-serve door where there genuinely is none', () => {
    expect(circleDoor({ ...base, reason: 'invite-only' }).action).toBeNull()
    expect(circleDoor({ ...base, reason: 'closed' }).action).toBeNull()
  })

  it('keeps the team door and the member door apart, which is the ADR-1015 conflation', () => {
    const team = circleDoor({ ...base, reason: 'space-members-only' })
    const paying = circleDoor({ ...base, reason: 'membership-only' })
    expect(team.title).toContain('team')
    expect(team.action?.href).toBe('/spaces/royaltemple')
    expect(paying.action?.href).toBe('/spaces/royaltemple/memberships')
    expect(team.body).not.toBe(paying.body)
  })

  it('a sign-in comes back to the circle the reader was looking at', () => {
    expect(circleDoor({ ...base, reason: 'signed-out' }).action?.href).toBe('/join?next=/circles/temple-moon')
  })

  it('names the Space when it knows it, and stays readable when it does not', () => {
    const named = circleDoor({ ...base, reason: 'membership-only' })
    expect(named.title).toContain('Royal Temple')
    const anon = circleDoor({ ...base, reason: 'membership-only', spaceName: '   ', spaceSlug: null })
    expect(anon.title).toContain('this Space')
    // No Space to send them to means no button, rather than a link to /spaces/null.
    expect(anon.action).toBeNull()
  })
})

describe('the door set matches the policy that produces it', () => {
  // A personal Circle lives on the root sentinel, so every space-shaped fact is false. Driving
  // the real policy rather than hand-listing reasons means a new access mode shows up here.
  const facts = (access: string) => ({
    unlisted: false,
    access: access as never,
    hostId: 'host-1',
    viewerProfileId: 'viewer-1',
    isMember: false,
    isSpaceMember: false,
    isSpacePaidMember: false,
    isSpaceSteward: false,
    isPlatformStaff: false,
  })

  it('every closed access mode yields a reason circleDoor can answer', () => {
    const closed = CIRCLE_ACCESS_MODES.filter((m) => m !== 'open')
    expect(closed.length).toBeGreaterThanOrEqual(4)
    for (const mode of closed) {
      const verdict = canJoinCircle(facts(mode))
      expect(verdict.ok, `${mode} should refuse an outsider`).toBe(false)
      if (verdict.ok) continue
      const door = circleDoor({ ...base, reason: verdict.reason })
      expect(door.title, `${mode} -> ${verdict.reason}`).toBeTruthy()
    }
  })

  it('a signed-out viewer is told to sign in rather than told the mode', () => {
    const verdict = canJoinCircle({ ...facts('space_paid_members'), viewerProfileId: null })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('signed-out')
  })
})

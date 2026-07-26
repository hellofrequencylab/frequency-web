import { describe, it, expect } from 'vitest'
import {
  approverSideForShare,
  roleFor,
  shouldAutoAcceptShare,
  shareWriteFailureMessage,
  isPersonalMemberSpace,
  collaboratorSpaceGateError,
} from './event-share'

// The PURE authz/shaping helpers behind shared / co-hosted events (Events EC3). The IO reads/writes run
// behind the service-role admin client; these decide WHO approves a pending share, WHICH side a space
// plays, and WHETHER a request auto-accepts. Mirrors lib/spaces/collaborations.test.ts.

const HOME = 'space-home' // the event's home space
const TARGET = 'space-target' // the space the event is shared TO

describe('approverSideForShare', () => {
  it('HOST INVITED a space (inviter = the event home space) -> the TARGET SPACE approves', () => {
    const row = { space_id: TARGET, invited_by_space_id: HOME }
    expect(approverSideForShare(row, HOME)).toBe('target-space')
  })

  it('HOST INVITED for a platform event (inviter = null) -> the TARGET SPACE approves', () => {
    const row = { space_id: TARGET, invited_by_space_id: null }
    expect(approverSideForShare(row, null)).toBe('target-space')
  })

  it('SPACE asked to FEATURE (inviter = the target space itself) -> the EVENT HOST approves', () => {
    const row = { space_id: TARGET, invited_by_space_id: TARGET }
    expect(approverSideForShare(row, HOME)).toBe('event-host')
  })

  it('the approver is always the side that did NOT initiate', () => {
    // Host initiated -> not the host who approves.
    expect(approverSideForShare({ space_id: TARGET, invited_by_space_id: HOME }, HOME)).not.toBe('event-host')
    // Target initiated -> not the target who approves.
    expect(approverSideForShare({ space_id: TARGET, invited_by_space_id: TARGET }, HOME)).not.toBe('target-space')
  })
})

describe('roleFor', () => {
  it('is target for the shared-to space and host for anyone else', () => {
    expect(roleFor({ space_id: TARGET }, TARGET)).toBe('target')
    expect(roleFor({ space_id: TARGET }, HOME)).toBe('host')
  })
})

describe('shouldAutoAcceptShare (the auto-accept predicate)', () => {
  it('auto-accepts when the caller already stewards the approving side', () => {
    expect(shouldAutoAcceptShare({ callerStewardsApprovingSide: true, collaborationLinksSpaces: false })).toBe(true)
  })
  it('auto-accepts when an accepted collaboration already links the two spaces', () => {
    expect(shouldAutoAcceptShare({ callerStewardsApprovingSide: false, collaborationLinksSpaces: true })).toBe(true)
  })
  it('stays PENDING when neither holds (a real approval round-trip is required)', () => {
    expect(shouldAutoAcceptShare({ callerStewardsApprovingSide: false, collaborationLinksSpaces: false })).toBe(false)
  })
})

describe('shareWriteFailureMessage (failed insert -> actionable member copy)', () => {
  it('a missing table (unapplied EC3 migration) tells the host an operator must finish setup, not "try again"', () => {
    // PGRST205 = PostgREST schema-cache miss; 42P01 = undefined_table. Both mean the
    // event_space_shares migration band never applied here, so retrying cannot help.
    for (const code of ['PGRST205', '42P01']) {
      const msg = shareWriteFailureMessage(code)
      expect(msg).toContain('operator')
      expect(msg).not.toContain('Try again')
    }
  })

  it('a permission failure (service role not writing) maps to the same operator line', () => {
    expect(shareWriteFailureMessage('42501')).toBe(shareWriteFailureMessage('42P01'))
  })

  it('a vanished event/space (23503) asks for a refresh', () => {
    expect(shareWriteFailureMessage('23503')).toContain('Refresh')
  })

  it('a non-uuid target (22P02) says the pick was not a Space', () => {
    expect(shareWriteFailureMessage('22P02')).toContain('not a Space')
  })

  it('anything unrecognized keeps the plain retry line', () => {
    expect(shareWriteFailureMessage('XX000')).toBe('Could not share this event. Try again.')
    expect(shareWriteFailureMessage(undefined)).toBe('Could not share this event. Try again.')
    expect(shareWriteFailureMessage(null)).toBe('Could not share this event. Try again.')
  })

  it('never emits an em dash (brand copy hard rule)', () => {
    for (const code of ['PGRST205', '42P01', '42501', '23503', '22P02', 'XX000', undefined]) {
      expect(shareWriteFailureMessage(code)).not.toContain('—')
    }
  })
})

// ── The Collaborator gate (ADR-834): who can be shared with ─────────────────────────────────────────

/** A real business, owned by someone whose member identity does NOT mirror the Space's. */
const ROYAL_TEMPLE = {
  type: 'business',
  name: 'Royal Temple',
  brandName: 'Royal Temple',
  slug: 'royaltemple',
  ownerDisplayName: 'Meghan Riley',
  ownerHandle: 'meghanriley',
}

describe('isPersonalMemberSpace (a Space that reads as its owner, not a business)', () => {
  it('flags a Space named exactly after its owner (the "Daniel Tyack" screenshot case)', () => {
    expect(
      isPersonalMemberSpace({
        type: 'business',
        name: 'Daniel Tyack',
        brandName: 'Daniel Tyack',
        slug: 'danieltyack',
        ownerDisplayName: 'Daniel Tyack',
        ownerHandle: 'danieltyack',
      }),
    ).toBe(true)
  })

  it('matches through punctuation/casing differences (slug "audrey-dewitt" vs handle "audreydewitt")', () => {
    expect(
      isPersonalMemberSpace({
        type: 'business',
        name: 'Audrey DeWitt',
        brandName: null,
        slug: 'audrey-dewitt',
        ownerDisplayName: 'Audrey DeWitt',
        ownerHandle: 'audreydewitt',
      }),
    ).toBe(true)
  })

  it('flags a brand_name that mirrors the owner even when name/slug differ', () => {
    expect(
      isPersonalMemberSpace({
        type: 'business',
        name: 'Studio 7',
        brandName: 'Danny Kenduck',
        slug: 'studio-7',
        ownerDisplayName: 'Danny Kenduck',
        ownerHandle: 'dannyk',
      }),
    ).toBe(true)
  })

  it('a real business named differently from its owner is NOT personal', () => {
    expect(isPersonalMemberSpace(ROYAL_TEMPLE)).toBe(false)
  })

  it('fails OPEN with no owner identity (a UX guard, not a security boundary)', () => {
    expect(
      isPersonalMemberSpace({
        type: 'business',
        name: 'Daniel Tyack',
        brandName: null,
        slug: 'danieltyack',
        ownerDisplayName: null,
        ownerHandle: null,
      }),
    ).toBe(false)
  })
})

describe('collaboratorSpaceGateError (the one pickable-Space rule)', () => {
  it('a real Business Space passes', () => {
    expect(collaboratorSpaceGateError(ROYAL_TEMPLE, 'invite')).toBeNull()
  })

  it('a nonprofit passes too (both console designators are valid Collaborators)', () => {
    expect(collaboratorSpaceGateError({ ...ROYAL_TEMPLE, type: 'nonprofit' }, 'invite')).toBeNull()
  })

  it('the platform root is never a share target', () => {
    const msg = collaboratorSpaceGateError({ ...ROYAL_TEMPLE, type: 'root', name: 'Frequency', slug: 'frequency' })
    expect(msg).toContain('Business or Non Profit Space')
  })

  it("a member's personal space is rejected with the cohost pointer (invite side)", () => {
    const msg = collaboratorSpaceGateError(
      {
        type: 'business',
        name: 'Daniel Tyack',
        brandName: 'Daniel Tyack',
        slug: 'danieltyack',
        ownerDisplayName: 'Daniel Tyack',
        ownerHandle: 'danieltyack',
      },
      'invite',
    )
    expect(msg).toBe("That is a member's personal space. Invite them as a cohost instead.")
  })

  it('the feature side speaks to the personal-space steward, still pointing at the cohost path', () => {
    const msg = collaboratorSpaceGateError(
      {
        type: 'business',
        name: 'Daniel Tyack',
        brandName: null,
        slug: 'danieltyack',
        ownerDisplayName: 'Daniel Tyack',
        ownerHandle: 'danieltyack',
      },
      'feature',
    )
    expect(msg).toContain('cohost')
    expect(msg).not.toBe("That is a member's personal space. Invite them as a cohost instead.")
  })

  it('a legacy raw type (pre-ADR-552 rows) normalizes to business and passes', () => {
    expect(collaboratorSpaceGateError({ ...ROYAL_TEMPLE, type: 'event_space' }, 'invite')).toBeNull()
  })

  it('never emits an em dash (brand copy hard rule)', () => {
    const personal = {
      type: 'business',
      name: 'Daniel Tyack',
      brandName: null,
      slug: 'danieltyack',
      ownerDisplayName: 'Daniel Tyack',
      ownerHandle: 'danieltyack',
    }
    for (const msg of [
      collaboratorSpaceGateError({ ...ROYAL_TEMPLE, type: 'root' }),
      collaboratorSpaceGateError(personal, 'invite'),
      collaboratorSpaceGateError(personal, 'feature'),
    ]) {
      expect(msg).not.toContain('—')
    }
  })
})

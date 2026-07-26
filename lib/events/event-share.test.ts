import { describe, it, expect } from 'vitest'
import {
  approverSideForShare,
  roleFor,
  shouldAutoAcceptShare,
  shareWriteFailureMessage,
  collaboratorSpaceGateError,
  collaboratorTypeLabel,
  isPersonalMemberSpace,
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

// ── The Collaborator gate (ADR-835): who can be shared with ─────────────────────────────────────────
// The rule is STRUCTURAL: any real console-type Space (business / nonprofit, never the platform root)
// is Collaborator-eligible, INCLUDING a Space named after its owner. ADR-834's identity-mirroring
// heuristic is retired; the picker/row TYPE BADGE (collaboratorTypeLabel) now carries the
// person-vs-Space distinction the member sees.

describe('collaboratorSpaceGateError (the one pickable-Space rule)', () => {
  it('a real Business Space passes', () => {
    expect(collaboratorSpaceGateError({ type: 'business' })).toBeNull()
  })

  it('a nonprofit passes too (both console designators are valid Collaborators)', () => {
    expect(collaboratorSpaceGateError({ type: 'nonprofit' })).toBeNull()
  })

  it('an owner-named business Space IS eligible (the "Daniel Tyack" case, ADR-835 reversal)', () => {
    // The owner's own scenario: @danieltyack's business Space "Daniel Tyack" collaborates on the
    // Meld event. Personal accounts are profiles, not spaces — structure decides, names never do.
    expect(collaboratorSpaceGateError({ type: 'business' })).toBeNull()
  })

  it('the platform root is never a share target', () => {
    const msg = collaboratorSpaceGateError({ type: 'root' })
    expect(msg).toContain('Business or Non Profit Space')
  })

  it('a legacy raw type (pre-ADR-552 rows) normalizes to business and passes', () => {
    expect(collaboratorSpaceGateError({ type: 'event_space' })).toBeNull()
  })

  it('an unknown/null type fails safe into the business bucket (normalizeSpaceType contract)', () => {
    // normalizeSpaceType folds everything non-root into 'business', so a null type is still a
    // console Space and passes; only the root is structurally barred.
    expect(collaboratorSpaceGateError({ type: null })).toBeNull()
  })

  it('never emits an em dash (brand copy hard rule)', () => {
    expect(collaboratorSpaceGateError({ type: 'root' })).not.toContain('—')
  })
})

describe('isPersonalMemberSpace (RETIRED from the gates by ADR-835; kept only for the ADR-836 CRM tier)', () => {
  it('still detects an owner-mirroring identity for its remaining consumer (crm-access.ts)', () => {
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

  it('a business named differently from its owner does not mirror', () => {
    expect(
      isPersonalMemberSpace({
        type: 'business',
        name: 'Royal Temple',
        brandName: 'Royal Temple',
        slug: 'royaltemple',
        ownerDisplayName: 'Meghan Riley',
        ownerHandle: 'meghanriley',
      }),
    ).toBe(false)
  })

  it('fails OPEN with no owner identity (a UX signal, never a security boundary)', () => {
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

  it('does NOT decide Collaborator eligibility: the mirroring Space still passes the share gate', () => {
    // The ADR-835 contract in one assertion: even a perfect identity mirror is a valid Collaborator,
    // because eligibility is structural (a spaces row of console type), never name-based.
    expect(collaboratorSpaceGateError({ type: 'business' })).toBeNull()
  })
})

describe('collaboratorTypeLabel (the Space-type disambiguation badge)', () => {
  it('a business badges as "Business Space" (spelling out the entity kind so it never reads as a person)', () => {
    expect(collaboratorTypeLabel('business')).toBe('Business Space')
  })

  it('a nonprofit badges as "Non Profit" (the NAMING designator already reads as an organization)', () => {
    expect(collaboratorTypeLabel('nonprofit')).toBe('Non Profit')
  })

  it('a legacy raw type normalizes before labeling (an unmigrated row still badges correctly)', () => {
    expect(collaboratorTypeLabel('event_space')).toBe('Business Space')
    expect(collaboratorTypeLabel('organization')).toBe('Non Profit')
  })

  it('null/undefined fall into the business label, never an empty badge', () => {
    expect(collaboratorTypeLabel(null)).toBe('Business Space')
    expect(collaboratorTypeLabel(undefined)).toBe('Business Space')
  })

  it('never emits an em dash (brand copy hard rule)', () => {
    for (const t of ['business', 'nonprofit', null]) {
      expect(collaboratorTypeLabel(t)).not.toContain('—')
    }
  })
})

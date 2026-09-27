import { describe, it, expect } from 'vitest'
import {
  viewerInDispatchAudience,
  type DispatchAudienceTarget,
  type DispatchViewerContext,
} from './dispatch-audience'

// THE LEAK THIS PINS (found in the 2026-09-27 Spaces audit).
//
// components/feed/feed-list.tsx picked the feed's lead Dispatch card with NO audience check at all:
// `dispatchCandidates` filtered on `status` + `hidden_at` only, and `pickLeadDispatch` returned the
// first non-event row to whoever was looking. So the first Space Dispatch any Space ever sent — a
// post written for that Space's paying members — would have rendered as the lead card in EVERY
// member's feed. It had never fired only because `dispatches` has never held a production row.
//
// These cases are the rule from lib/dispatches.ts:17 (the right-rail reader, which always filtered
// correctly) restated as assertions, so the two surfaces cannot drift apart again.

/** A viewer with no reach anywhere: the person the leak exposed other people's Dispatches to. */
const STRANGER: DispatchViewerContext = {
  profileId: 'p-stranger',
  circleIds: [],
  hubIds: [],
  nexusIds: [],
  spaceIds: [],
  regionId: null,
  home: null,
  resonantHostIds: new Set(),
}

const withReach = (reach: Partial<DispatchViewerContext>): DispatchViewerContext => ({
  ...STRANGER,
  ...reach,
})

const row = (r: Partial<DispatchAudienceTarget>): DispatchAudienceTarget => ({
  audience_scope: null,
  audience_id: null,
  ...r,
})

describe('viewerInDispatchAudience — the gate the feed card shipped without', () => {
  it('🔴 does NOT show a Space Dispatch to someone outside the Space', () => {
    expect(
      viewerInDispatchAudience(row({ audience_scope: 'space', audience_id: 's-royaltemple' }), STRANGER),
    ).toBe(false)
  })

  it('shows a Space Dispatch to an active member of that Space', () => {
    expect(
      viewerInDispatchAudience(
        row({ audience_scope: 'space', audience_id: 's-royaltemple' }),
        withReach({ spaceIds: ['s-royaltemple'] }),
      ),
    ).toBe(true)
  })

  it('does not show one Space’s Dispatch to a member of a different Space', () => {
    expect(
      viewerInDispatchAudience(
        row({ audience_scope: 'space', audience_id: 's-royaltemple' }),
        withReach({ spaceIds: ['s-somewhere-else'] }),
      ),
    ).toBe(false)
  })

  it('shows a global Dispatch to everyone, with no audience_id', () => {
    expect(viewerInDispatchAudience(row({ audience_scope: 'global' }), STRANGER)).toBe(true)
  })

  it('shows the author their own Dispatch even with no reach', () => {
    expect(
      viewerInDispatchAudience(
        row({ audience_scope: 'space', audience_id: 's-royaltemple', author_id: 'p-stranger' }),
        STRANGER,
      ),
    ).toBe(true)
  })

  it.each([
    ['circle', 'circleIds'],
    ['hub', 'hubIds'],
    ['nexus', 'nexusIds'],
    ['space', 'spaceIds'],
  ] as const)('gates %s on the viewer’s %s', (scope, key) => {
    const target = row({ audience_scope: scope, audience_id: 'x-1' })
    expect(viewerInDispatchAudience(target, STRANGER)).toBe(false)
    expect(viewerInDispatchAudience(target, withReach({ [key]: ['x-1'] }))).toBe(true)
    // The tiers are not interchangeable: reach on the wrong axis must not open the row.
    const otherKeys = (['circleIds', 'hubIds', 'nexusIds', 'spaceIds'] as const).filter((k) => k !== key)
    for (const other of otherKeys) {
      expect(viewerInDispatchAudience(target, withReach({ [other]: ['x-1'] }))).toBe(false)
    }
  })

  describe('fails closed', () => {
    it('refuses a scoped row with no audience_id', () => {
      for (const scope of ['circle', 'hub', 'nexus', 'space']) {
        expect(
          viewerInDispatchAudience(row({ audience_scope: scope, audience_id: null }), withReach({
            circleIds: ['x'], hubIds: ['x'], nexusIds: ['x'], spaceIds: ['x'],
          })),
        ).toBe(false)
      }
    })

    it('refuses an unknown or absent scope', () => {
      expect(viewerInDispatchAudience(row({ audience_scope: 'planet', audience_id: 'x-1' }), STRANGER)).toBe(false)
      expect(viewerInDispatchAudience(row({ audience_scope: null, audience_id: 'x-1' }), STRANGER)).toBe(false)
    })

    it('does not treat a signed-out viewer as the author of an authorless row', () => {
      const anon = withReach({ profileId: null })
      expect(viewerInDispatchAudience(row({ audience_scope: 'space', audience_id: null, author_id: null }), anon)).toBe(false)
    })
  })
})

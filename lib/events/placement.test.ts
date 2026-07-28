import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { livePlacementPatch, clearPlacementPatch, journeyLinkPatch } from './placement'

// "Where does this event live" — the Event ⇄ Circle tie.
//
// The trap these lock in: `events.scope_circle_id` (the H1-1 typed arc column) is NOT what the
// product reads. Every circle reader still keys on the BARE pair `scope_type='circle'` +
// `scope_id` — the circle page, the rail, the upcoming widget, index-data, the Dispatch audience,
// the RLS `can_read_event` circle_only disjunct, and `getEventCapabilities` (which is what gives
// the Circle's host management rights). The expand-phase sync trigger only derives BARE → TYPED
// (its reverse path is guarded on `scope_id IS NULL`, and scope_id is NOT NULL), so writing the
// typed column alone placed an event in a Circle that the Circle could never see.

const CIRCLE = 'cccccccc-0000-4000-a000-00000000000c'
const SPACE = 'aaaaaaaa-0000-4000-a000-00000000000a'
const REGION = 'rrrrrrrr-0000-4000-a000-00000000000r'

describe('livePlacementPatch', () => {
  it('a Space placement is the one placement column', () => {
    expect(livePlacementPatch({ type: 'space', id: SPACE })).toEqual({ space_id: SPACE })
  })

  it('a Circle placement writes the BARE pair as well as the typed arc column', () => {
    const patch = livePlacementPatch({ type: 'circle', id: CIRCLE })
    expect(patch.scope_circle_id).toBe(CIRCLE)
    // Without these two the Circle never sees the event, and its host gets no rights over it.
    expect(patch.scope_id).toBe(CIRCLE)
    expect(patch.scope_type).toBe('circle')
  })

  it("a Circle placement carries the circle's Space (ADR-857) when it has one", () => {
    expect(livePlacementPatch({ type: 'circle', id: CIRCLE }, { circleSpaceId: SPACE }).space_id).toBe(SPACE)
  })

  it('a personal circle (no Space) leaves the existing placement alone', () => {
    expect(livePlacementPatch({ type: 'circle', id: CIRCLE }, { circleSpaceId: null })).not.toHaveProperty('space_id')
    expect(livePlacementPatch({ type: 'circle', id: CIRCLE })).not.toHaveProperty('space_id')
  })
})

describe('clearPlacementPatch', () => {
  it('always clears both live columns and the hosting entity (ADR-819)', () => {
    const patch = clearPlacementPatch({ scopeType: 'public', visibility: 'public', regionId: null })
    expect(patch).toEqual({ space_id: null, scope_circle_id: null, host_space_id: null })
  })

  it('moves a CIRCLE event back to its region, so Remove actually removes it', () => {
    const patch = clearPlacementPatch({ scopeType: 'circle', visibility: 'public', regionId: REGION })
    expect(patch.scope_circle_id).toBeNull()
    expect(patch.scope_id).toBe(REGION)
    expect(patch.scope_type).toBe('public')
  })

  it('steps circle_only down to unlisted, never publishing an event the host kept inside', () => {
    const patch = clearPlacementPatch({ scopeType: 'circle', visibility: 'circle_only', regionId: REGION })
    expect(patch.visibility).toBe('unlisted')
    expect(patch.visibility).not.toBe('public')
  })

  it('leaves a visibility that survives the move untouched', () => {
    expect(clearPlacementPatch({ scopeType: 'circle', visibility: 'private', regionId: REGION })).not.toHaveProperty(
      'visibility',
    )
  })

  it('never half-moves a circle event: no region means the bare pair stays put', () => {
    const patch = clearPlacementPatch({ scopeType: 'circle', visibility: 'circle_only', regionId: null })
    expect(patch).not.toHaveProperty('scope_id')
    expect(patch).not.toHaveProperty('scope_type')
  })
})

// The Event ⇄ Journey link is an ASSOCIATION, like events.space_id, not a placement. The trap it
// has to stay clear of is the mirror image of the circle bug: a Journey has no region, no
// membership roll and no RLS disjunct, so if attaching one ever moved the bare scope pair the
// event would vanish from its Circle (and from the circle_only read) and land nowhere.
const JOURNEY = 'jjjjjjjj-0000-4000-a000-00000000000j'

describe('journeyLinkPatch', () => {
  it('attaching a Journey writes the association column and nothing else', () => {
    expect(journeyLinkPatch(JOURNEY)).toEqual({ journey_id: JOURNEY })
  })

  it('detaching is the same shape with null, so attach and detach can never drift apart', () => {
    expect(journeyLinkPatch(null)).toEqual({ journey_id: null })
  })

  it('a Journey link NEVER moves the event: no placement column may appear in the patch', () => {
    for (const patch of [journeyLinkPatch(JOURNEY), journeyLinkPatch(null)]) {
      for (const col of ['scope_id', 'scope_type', 'scope_circle_id', 'space_id', 'host_space_id', 'visibility']) {
        expect(patch).not.toHaveProperty(col)
      }
    }
  })
})

describe('placement and the Journey link are orthogonal', () => {
  it('placing an event does not touch its Journey link', () => {
    expect(livePlacementPatch({ type: 'space', id: SPACE })).not.toHaveProperty('journey_id')
    expect(livePlacementPatch({ type: 'circle', id: CIRCLE }, { circleSpaceId: SPACE })).not.toHaveProperty(
      'journey_id',
    )
  })

  it('removing an event from its Circle leaves it in its Journey', () => {
    // "Remove from Circle" moves the event home. The Journey it is part of is a different fact
    // about it, and un-placing must not silently un-link it.
    const patch = clearPlacementPatch({ scopeType: 'circle', visibility: 'circle_only', regionId: REGION })
    expect(patch).not.toHaveProperty('journey_id')
  })
})

describe('the tie is written and gated through the one rule (source shape)', () => {
  const root = join(__dirname, '..', '..')
  const read = (p: string) => readFileSync(join(root, p), 'utf8')

  it('placement writes go through the shared patches, never a hand-rolled column set', () => {
    const src = read('app/(main)/events/placement-actions.ts')
    expect(src).toContain('livePlacementPatch')
    expect(src).toContain('clearPlacementPatch')
    // The old inline patch is what made a circle placement invisible.
    expect(src).not.toMatch(/update\(\s*\{\s*scope_circle_id:/)
  })

  it('createEvent gates a Circle on circle.editSettings, the same rule that approves a placement', () => {
    const src = read('app/(main)/events/actions.ts')
    expect(src).toContain("getCircleCapabilities")
    expect(src).toContain("circleCaps.has('circle.editSettings')")
    // host_id alone was narrower than every other circle authority in the product.
    expect(src).not.toContain('listCircleStewardIds')
  })

  it('the create page re-resolves a ?circle= deep link it could not host-match', () => {
    const src = read('app/(main)/events/new/page.tsx')
    expect(src).toContain('getCircleCapabilities')
    expect(src).toContain('droppedCircleLink')
  })

  it('both event actions write the Journey link through journeyLinkPatch, never inline', () => {
    const src = read('app/(main)/events/actions.ts')
    expect(src).toContain('journeyLinkPatch')
    // An inline `journey_id:` in an insert/update payload is the drift this seam exists to stop.
    expect(src).not.toMatch(/journey_id:/)
  })

  it('attaching a Journey is gated on canEditJourney, the one Journey authority', () => {
    const src = read('app/(main)/events/actions.ts')
    expect(src).toContain('canEditJourney')
    // Detach must not need it, so the check has to sit behind a non-empty id, not at the top.
    expect(src).toMatch(/if \(!journeyId\) return \{ ok: true, patch: journeyLinkPatch\(null\) \}/)
  })

  it('an absent journeyId field leaves the link alone (no accidental detach by another writer)', () => {
    const src = read('app/(main)/events/actions.ts')
    expect(src).toMatch(/if \(raw === null\) return NO_JOURNEY_CHANGE/)
  })

  it('both forms offer the Journeys the gate admits, and the create page re-resolves ?journey=', () => {
    const create = read('app/(main)/events/new/page.tsx')
    const edit = read('app/(main)/events/[slug]/edit/page.tsx')
    for (const src of [create, edit]) {
      expect(src).toContain('listLinkableJourneys')
      expect(src).toContain('canEditJourney')
    }
    expect(create).toContain('droppedJourneyLink')
  })

  it('the form hides the Journey field rather than offering one that would detach a link it cannot show', () => {
    const src = read('app/(main)/events/new/event-form.tsx')
    expect(src).toContain('showJourneyField')
    expect(src).toMatch(/if \(showJourneyField\) fd\.set\('journeyId', journeyId\)/)
  })

  it('the migration adds an ASSOCIATION column, not a fourth scope_type', () => {
    const src = read('supabase/migrations/20270117000000_events_journey_link.sql')
    // The Journey entity is journey_plans; there is no `journeys` table to reference.
    expect(src).toMatch(/references public\.journey_plans\(id\) on delete set null/)
    // Deleting a Journey must never delete somebody's Event.
    expect(src).not.toMatch(/on delete cascade/)
    // A Journey is not an event's home: the migration must not widen the scope_type vocabulary.
    expect(src).not.toMatch(/scope_type in \(/)
  })
})

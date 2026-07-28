import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { livePlacementPatch, clearPlacementPatch } from './placement'

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
})

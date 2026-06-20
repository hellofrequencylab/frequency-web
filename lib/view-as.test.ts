import { describe, it, expect, vi } from 'vitest'

// view-as.ts pulls in `next/headers` for the cookie reads; the PURE parser/serializer below never
// touch it, but the import is evaluated at module load, so stub it to keep the unit test hermetic.
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import {
  parseViewAsCookie,
  serializeViewAsTarget,
  isEntityTarget,
  type ViewAsTarget,
} from './view-as'

// The view-as cookie carries TWO axes in one value (ADR-340): the community ladder (a CommunityRole
// or 'visitor', unprefixed) and the entity axis (`entity:<type>`). These lock that the parser
// accepts only valid targets, the entity branch fails closed for non-provisionable types, and
// parse∘serialize round-trips. The downgrade/escalation gating is enforced separately in applyViewAs
// + the server action; this is the wire-format contract.

describe('parseViewAsCookie', () => {
  it('parses community-ladder targets unprefixed', () => {
    expect(parseViewAsCookie('member')).toBe('member')
    expect(parseViewAsCookie('host')).toBe('host')
    expect(parseViewAsCookie('mentor')).toBe('mentor')
    expect(parseViewAsCookie('visitor')).toBe('visitor')
  })

  it('parses a provisionable entity target into the discriminated shape', () => {
    expect(parseViewAsCookie('entity:practitioner')).toEqual({ kind: 'entity', type: 'practitioner' })
    expect(parseViewAsCookie('entity:event_space')).toEqual({ kind: 'entity', type: 'event_space' })
  })

  it('fails closed for a non-provisionable or unknown entity type (no escalation)', () => {
    // `root` is never previewable-as-entity (the platform host, no blueprint); a garbage type and an
    // empty payload are rejected. lab/partner are accepted exactly when their blueprints are wired
    // (ADMIN-05), so they are covered by the blueprint-driven assertions in entity-roles.test.ts.
    expect(parseViewAsCookie('entity:root')).toBeNull()
    expect(parseViewAsCookie('entity:school')).toBeNull()
    expect(parseViewAsCookie('entity:')).toBeNull()
  })

  it('rejects unknown / empty / nullish values', () => {
    expect(parseViewAsCookie('janitor-ish')).toBeNull()
    expect(parseViewAsCookie('')).toBeNull()
    expect(parseViewAsCookie(undefined)).toBeNull()
    expect(parseViewAsCookie(null)).toBeNull()
  })
})

describe('serializeViewAsTarget ∘ parseViewAsCookie round-trip', () => {
  const cases: ViewAsTarget[] = [
    'member',
    'host',
    'visitor',
    { kind: 'entity', type: 'practitioner' },
    { kind: 'entity', type: 'business' },
  ]
  for (const target of cases) {
    it(`round-trips ${JSON.stringify(target)}`, () => {
      expect(parseViewAsCookie(serializeViewAsTarget(target))).toEqual(target)
    })
  }
})

describe('isEntityTarget', () => {
  it('discriminates the entity axis from the community ladder', () => {
    expect(isEntityTarget({ kind: 'entity', type: 'coaching' })).toBe(true)
    expect(isEntityTarget('host')).toBe(false)
    expect(isEntityTarget('visitor')).toBe(false)
    expect(isEntityTarget(null)).toBe(false)
  })
})

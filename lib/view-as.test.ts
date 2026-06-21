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
// or 'visitor', unprefixed) and the entity axis (`entity:<spaceId>`, naming a SPECIFIC Space).
// These lock that the parser accepts only valid targets, the entity branch is shape-checked (a
// malformed id payload is rejected), and parse∘serialize round-trips. The authoritative
// "may this staffer preview THIS Space" gate + the downgrade/escalation safety live in the
// previewAsSpace server action + applyViewAs; this is the wire-format contract.

describe('parseViewAsCookie', () => {
  it('parses community-ladder targets unprefixed', () => {
    expect(parseViewAsCookie('member')).toBe('member')
    expect(parseViewAsCookie('host')).toBe('host')
    expect(parseViewAsCookie('mentor')).toBe('mentor')
    expect(parseViewAsCookie('visitor')).toBe('visitor')
  })

  it('parses a specific-Space entity target into the discriminated shape', () => {
    expect(parseViewAsCookie('entity:9f3c2a1b-0000-4000-8000-000000000000')).toEqual({
      kind: 'entity',
      spaceId: '9f3c2a1b-0000-4000-8000-000000000000',
    })
    expect(parseViewAsCookie('entity:acme-studio')).toEqual({ kind: 'entity', spaceId: 'acme-studio' })
  })

  it('fails closed for a malformed or empty Space-id payload', () => {
    // A shape check only (id-safe characters, bounded length); the real "may preview THIS Space"
    // authority is the previewAsSpace server action. A payload with delimiter / path characters or
    // an empty body is rejected here so a forged cookie can never carry anything strange.
    expect(parseViewAsCookie('entity:')).toBeNull()
    expect(parseViewAsCookie('entity:has spaces')).toBeNull()
    expect(parseViewAsCookie('entity:../../etc')).toBeNull()
    expect(parseViewAsCookie(`entity:${'x'.repeat(129)}`)).toBeNull()
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
    { kind: 'entity', spaceId: '9f3c2a1b-0000-4000-8000-000000000000' },
    { kind: 'entity', spaceId: 'acme-studio' },
  ]
  for (const target of cases) {
    it(`round-trips ${JSON.stringify(target)}`, () => {
      expect(parseViewAsCookie(serializeViewAsTarget(target))).toEqual(target)
    })
  }
})

describe('isEntityTarget', () => {
  it('discriminates the entity axis from the community ladder', () => {
    expect(isEntityTarget({ kind: 'entity', spaceId: 'acme-studio' })).toBe(true)
    expect(isEntityTarget('host')).toBe(false)
    expect(isEntityTarget('visitor')).toBe(false)
    expect(isEntityTarget(null)).toBe(false)
  })
})

import { describe, it, expect, vi } from 'vitest'

// operator-context.ts pulls in `next/headers` for the cookie read (and `server-only`, stubbed in
// vitest.config.ts). The PURE parser/validator + the availability/landing rules below never touch
// the cookie, but the import is evaluated at module load, so stub next/headers to keep the unit test
// hermetic. (The DB-backed resolveOperatorContext is NOT exercised here — these lock the pure core.)
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import {
  parseContextCookie,
  serializeContext,
  sameContext,
  isContextAvailable,
  landingHrefFor,
  PERSONAL_HOME,
  ADMIN_HOME,
  type OperatorContext,
  type AvailableContext,
} from './operator-context'

// ── parse / serialize (the wire-format contract) ──────────────────────────────────────────

describe('parseContextCookie', () => {
  it('parses the two unprefixed literals', () => {
    expect(parseContextCookie('personal')).toEqual({ kind: 'personal' })
    expect(parseContextCookie('admin')).toEqual({ kind: 'admin' })
  })

  it('parses an operator target into the discriminated shape', () => {
    expect(parseContextCookie('operator:9f3c2a1b-0000-4000-8000-000000000000')).toEqual({
      kind: 'operator',
      spaceId: '9f3c2a1b-0000-4000-8000-000000000000',
    })
    expect(parseContextCookie('operator:acme-studio')).toEqual({
      kind: 'operator',
      spaceId: 'acme-studio',
    })
  })

  it('fails closed for a malformed or empty operator payload', () => {
    // A shape check only (id-safe characters, bounded length); the authoritative "does the caller
    // actually run THIS Space" check is resolveOperatorContext. A payload with delimiter / path
    // characters or an empty body is rejected so a forged cookie can never carry anything strange.
    expect(parseContextCookie('operator:')).toBeNull()
    expect(parseContextCookie('operator:has spaces')).toBeNull()
    expect(parseContextCookie('operator:../../etc')).toBeNull()
    expect(parseContextCookie(`operator:${'x'.repeat(129)}`)).toBeNull()
  })

  it('rejects unknown / empty / nullish values (default = personal happens at the resolver)', () => {
    expect(parseContextCookie('admin-ish')).toBeNull()
    expect(parseContextCookie('owner:acme')).toBeNull()
    expect(parseContextCookie('')).toBeNull()
    expect(parseContextCookie(undefined)).toBeNull()
    expect(parseContextCookie(null)).toBeNull()
  })
})

describe('serializeContext ∘ parseContextCookie round-trip', () => {
  const cases: OperatorContext[] = [
    { kind: 'personal' },
    { kind: 'admin' },
    { kind: 'operator', spaceId: '9f3c2a1b-0000-4000-8000-000000000000' },
    { kind: 'operator', spaceId: 'acme-studio' },
  ]
  for (const context of cases) {
    it(`round-trips ${JSON.stringify(context)}`, () => {
      expect(parseContextCookie(serializeContext(context))).toEqual(context)
    })
  }
})

describe('sameContext', () => {
  it('matches by kind, and by Space id for operator', () => {
    expect(sameContext({ kind: 'personal' }, { kind: 'personal' })).toBe(true)
    expect(sameContext({ kind: 'admin' }, { kind: 'admin' })).toBe(true)
    expect(
      sameContext({ kind: 'operator', spaceId: 'a' }, { kind: 'operator', spaceId: 'a' }),
    ).toBe(true)
    expect(
      sameContext({ kind: 'operator', spaceId: 'a' }, { kind: 'operator', spaceId: 'b' }),
    ).toBe(false)
    expect(sameContext({ kind: 'personal' }, { kind: 'admin' })).toBe(false)
  })
})

// ── the validation rule the resolver + the set-context action both run ─────────────────────

describe('isContextAvailable — the framing-only validation rule', () => {
  // A caller who runs ONE Space (acme) and is NOT staff: personal + that operator option only.
  const available: AvailableContext[] = [
    { kind: 'personal', label: 'Personal', href: PERSONAL_HOME },
    { kind: 'operator', spaceId: 'acme', label: 'Acme', href: '/spaces/acme/manage', logoUrl: null },
  ]

  it('always allows personal', () => {
    expect(isContextAvailable({ kind: 'personal' }, available)).toBe(true)
    expect(isContextAvailable({ kind: 'personal' }, [])).toBe(true)
  })

  it('allows an operator target ONLY for a Space in the available set (re-derived ownership)', () => {
    expect(isContextAvailable({ kind: 'operator', spaceId: 'acme' }, available)).toBe(true)
    // An operator target for a Space the caller does NOT run resolves false → set-context rejects it,
    // resolver falls back to personal. This is the core security assertion.
    expect(isContextAvailable({ kind: 'operator', spaceId: 'other' }, available)).toBe(false)
  })

  it('HIDES admin for a non-staff caller (no admin option present)', () => {
    expect(isContextAvailable({ kind: 'admin' }, available)).toBe(false)
  })

  it('allows admin only when a staff caller has the admin option', () => {
    const withAdmin: AvailableContext[] = [
      ...available,
      { kind: 'admin', label: 'Admin', href: ADMIN_HOME },
    ]
    expect(isContextAvailable({ kind: 'admin' }, withAdmin)).toBe(true)
  })
})

// ── default-landing routing (drives the switcher + the redirect) ───────────────────────────

describe('landingHrefFor', () => {
  const available: AvailableContext[] = [
    { kind: 'personal', label: 'Personal', href: PERSONAL_HOME },
    { kind: 'operator', spaceId: 'acme', label: 'Acme', href: '/spaces/acme/manage', logoUrl: null },
    { kind: 'admin', label: 'Admin', href: ADMIN_HOME },
  ]

  it('routes personal to the member home', () => {
    expect(landingHrefFor({ kind: 'personal' }, available)).toBe(PERSONAL_HOME)
  })

  it("routes an operator context to that Space's manage console", () => {
    expect(landingHrefFor({ kind: 'operator', spaceId: 'acme' }, available)).toBe('/spaces/acme/manage')
  })

  it('routes admin to the admin workspace', () => {
    expect(landingHrefFor({ kind: 'admin' }, available)).toBe(ADMIN_HOME)
  })

  it('falls back to the personal home for an operator Space not in the set (defence in depth)', () => {
    expect(landingHrefFor({ kind: 'operator', spaceId: 'ghost' }, available)).toBe(PERSONAL_HOME)
  })
})

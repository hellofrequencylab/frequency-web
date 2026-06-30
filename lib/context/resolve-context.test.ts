import { describe, it, expect, vi, beforeEach } from 'vitest'

// resolveOperatorContext is the server resolver: it re-derives the available set from REAL authority
// (listOperatedSpaces + the staff axis) and HONOURS the cookie only when it is still in that set.
// These tests mock the two IO seams (the operated-spaces read + the cookie) to lock the
// security-relevant rules WITHOUT a DB:
//   • an operator target for a Space the caller no longer runs FAILS SAFE to personal,
//   • the admin context is HIDDEN for a non-staff caller,
//   • a valid operator/admin cookie is honoured, and any error collapses to personal-only.

const listOperatedSpaces = vi.fn()
const cookiesGet = vi.fn()

vi.mock('@/lib/spaces/operated', () => ({
  listOperatedSpaces: (...args: unknown[]) => listOperatedSpaces(...args),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => cookiesGet(name) }),
}))

import { resolveOperatorContext } from './resolve-context'

/** One operated Space as listOperatedSpaces returns it. */
function space(id: string, name = id) {
  return {
    id,
    slug: id,
    name,
    type: 'business' as const,
    logoUrl: null,
    manageHref: `/spaces/${id}/manage`,
    via: 'owner' as const,
    memberCount: null,
  }
}

/** Make the cookie return a given raw value (or undefined). */
function setCookie(value: string | undefined) {
  cookiesGet.mockReturnValue(value === undefined ? undefined : { value })
}

beforeEach(() => {
  listOperatedSpaces.mockReset()
  cookiesGet.mockReset()
})

describe('resolveOperatorContext', () => {
  it('returns only the personal context for a signed-out caller (no cookie honoured)', async () => {
    const { context, available } = await resolveOperatorContext(null)
    expect(context).toEqual({ kind: 'personal' })
    expect(available).toEqual([{ kind: 'personal', label: 'Personal', href: '/feed' }])
    expect(listOperatedSpaces).not.toHaveBeenCalled()
  })

  it('offers one operator option per owned/admin Space; admin HIDDEN for a non-staff caller', async () => {
    listOperatedSpaces.mockResolvedValue([space('acme', 'Acme')])
    setCookie(undefined)
    const { context, available } = await resolveOperatorContext({ id: 'me', webRole: 'none' })
    expect(context).toEqual({ kind: 'personal' }) // absent cookie → default
    expect(available.map((a) => a.kind)).toEqual(['personal', 'operator'])
    expect(available.some((a) => a.kind === 'admin')).toBe(false)
  })

  it('offers the admin option for a staff caller', async () => {
    listOperatedSpaces.mockResolvedValue([])
    setCookie('admin')
    const { context, available } = await resolveOperatorContext({ id: 'me', webRole: 'janitor' })
    expect(available.some((a) => a.kind === 'admin')).toBe(true)
    expect(context).toEqual({ kind: 'admin' }) // valid + available → honoured
  })

  it('HONOURS an operator cookie for a Space the caller runs', async () => {
    listOperatedSpaces.mockResolvedValue([space('acme', 'Acme')])
    setCookie('operator:acme')
    const { context } = await resolveOperatorContext({ id: 'me', webRole: 'none' })
    expect(context).toEqual({ kind: 'operator', spaceId: 'acme' })
  })

  it('FAILS SAFE to personal when the operator cookie names a Space the caller does NOT run', async () => {
    listOperatedSpaces.mockResolvedValue([space('acme', 'Acme')])
    setCookie('operator:ghost') // a Space not in the re-derived set
    const { context } = await resolveOperatorContext({ id: 'me', webRole: 'none' })
    expect(context).toEqual({ kind: 'personal' })
  })

  it('FAILS SAFE to personal when a non-staff caller forges an admin cookie', async () => {
    listOperatedSpaces.mockResolvedValue([])
    setCookie('admin') // forged: caller is not staff, so no admin option exists
    const { context, available } = await resolveOperatorContext({ id: 'me', webRole: 'none' })
    expect(context).toEqual({ kind: 'personal' })
    expect(available.some((a) => a.kind === 'admin')).toBe(false)
  })

  it('collapses to personal-only on any error (fail-safe)', async () => {
    listOperatedSpaces.mockRejectedValue(new Error('db down'))
    setCookie('operator:acme')
    const { context, available } = await resolveOperatorContext({ id: 'me', webRole: 'janitor' })
    expect(context).toEqual({ kind: 'personal' })
    expect(available).toEqual([{ kind: 'personal', label: 'Personal', href: '/feed' }])
  })
})

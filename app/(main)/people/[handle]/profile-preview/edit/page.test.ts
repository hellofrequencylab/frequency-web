import { describe, it, expect, vi, beforeEach } from 'vitest'

// ADR-516 Phase C: the standalone member grid editor was retired; this route now redirects to the profile
// (where the builder lives inline in the rail), carrying the handle through.

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect }))

import LegacyProfileGridEditRedirect from './page'

beforeEach(() => vi.clearAllMocks())

describe('profile-preview/edit redirect', () => {
  it('redirects to the member profile', async () => {
    await LegacyProfileGridEditRedirect({ params: Promise.resolve({ handle: 'ada' }) })
    expect(redirect).toHaveBeenCalledWith('/people/ada')
  })
})

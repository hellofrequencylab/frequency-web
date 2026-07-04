import { describe, it, expect, vi, beforeEach } from 'vitest'

// ADR-516 Phase D: the standalone Space grid editor was retired; this route now redirects to the Space
// profile (where the freeform page builder lives inline in the rail), carrying the slug through.

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect }))

import LegacySpaceGridRedirect from './page'

beforeEach(() => vi.clearAllMocks())

describe('space profile grid redirect', () => {
  it('redirects to the space profile', async () => {
    await LegacySpaceGridRedirect({ params: Promise.resolve({ slug: 'calm-collective' }) })
    expect(redirect).toHaveBeenCalledWith('/spaces/calm-collective')
  })
})

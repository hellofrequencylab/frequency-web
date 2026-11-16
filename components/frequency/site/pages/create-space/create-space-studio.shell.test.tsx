import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
// The address is not readable yet: useSearchParams suspends, so the server HTML carries the Suspense fallback (SCAN-1264).
vi.mock('next/navigation', () => ({ useSearchParams: () => { throw new Promise(() => {}) } }))
vi.mock('@/app/(marketing)/create-a-space/actions', () => ({ restoreDraft: async () => ({ draft: null }), saveBuilderProgress: async () => ({ ok: true }), saveDraftLead: async () => ({ ok: false }), claimWithEmail: vi.fn(), claimWithGoogle: vi.fn(), continueSignedIn: vi.fn() }))
import { CreateSpaceStudio } from './create-space-studio'

describe('Create a Space fallback shell', () => {
  it('streams the hero without a second h1 or a second #cs-h1', () => {
    const html = renderToString(<CreateSpaceStudio />)
    expect(html).toContain('class="cs-h1"')
    expect(html).not.toMatch(/<h1[\s>]/)
    expect(html).not.toContain('id="cs-h1"')
    expect(html).not.toContain('aria-labelledby="cs-h1"')
  })
})

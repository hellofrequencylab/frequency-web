import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
// LIVE-2331: "Save with Google" came back with ?claim_error=, so the builder says why instead of a silent bounce.
const io = vi.hoisted(() => ({ query: '' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(io.query) }))
vi.mock('@/app/(marketing)/create-a-space/actions', () => ({ restoreDraft: async () => ({ draft: null }), saveBuilderProgress: async () => ({ ok: true }), saveDraftLead: async () => ({ ok: false }), claimWithEmail: vi.fn(), claimWithGoogle: vi.fn(), continueSignedIn: vi.fn() }))
import { CreateSpaceStudio } from './create-space-studio'
import { claimErrorLine } from '@/lib/create-space/claim-error'

describe('a refused Google claim', () => {
  it('shows the line for its code', () => {
    io.query = 'claim_error=handle'
    const html = renderToString(<CreateSpaceStudio />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('That handle got taken while you were saving.')
  })

  it('shows the generic line for an unknown code, and nothing without one', () => {
    io.query = 'claim_error=whatever'
    expect(renderToString(<CreateSpaceStudio />)).toContain(claimErrorLine('generic')!)
    io.query = ''
    expect(renderToString(<CreateSpaceStudio />)).not.toContain('class="cs-alert"')
  })
})

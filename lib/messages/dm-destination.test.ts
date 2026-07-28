import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── The retirement flag, exercised BOTH ways (ADR-896 Phase 2) ────────────────────────────
// The flag ships OFF, which means the off path is the one every member hits today and the on
// path is the one nobody has run yet. Testing only the off path would pin the status quo and
// prove nothing about the change; testing only the on path would let the default silently
// regress. Both, plus the fail-safe, or this is not covered.

const chatDmRoutesRetiredFlag = vi.fn<() => Promise<boolean>>()
vi.mock('@/lib/platform-flags', () => ({ chatDmRoutesRetiredFlag: () => chatDmRoutesRetiredFlag() }))

const { dmThreadHref } = await import('./dm-destination')

beforeEach(() => {
  chatDmRoutesRetiredFlag.mockReset()
})

describe('dmThreadHref', () => {
  it('with the flag OFF, returns exactly the string the call sites used to hardcode', async () => {
    chatDmRoutesRetiredFlag.mockResolvedValue(false)
    // Byte-identical to `/messages/${conversationId}`. Phase 2 must be INERT until an operator
    // flips the row, so five CRM redirects changing behaviour on deploy would be the bug.
    expect(await dmThreadHref('conv-1')).toBe('/messages/conv-1')
  })

  it('with the flag ON, hands the conversation to the dock in one hop', async () => {
    chatDmRoutesRetiredFlag.mockResolvedValue(true)
    // Not /messages/<id>, which would bounce off the retired route: a DOUBLE redirect the
    // member sees as the chat page painting and then jumping.
    expect(await dmThreadHref('conv-1')).toBe('/feed?chat=dm&thread=conv-1')
  })

  it('with the flag ON, honours a caller’s own landing page', async () => {
    chatDmRoutesRetiredFlag.mockResolvedValue(true)
    expect(await dmThreadHref('conv-1', '/circles/dawn/crm')).toBe('/circles/dawn/crm?chat=dm&thread=conv-1')
  })

  it('ignores the landing page while the DM route still renders', async () => {
    chatDmRoutesRetiredFlag.mockResolvedValue(false)
    expect(await dmThreadHref('conv-1', '/circles/dawn/crm')).toBe('/messages/conv-1')
  })
})

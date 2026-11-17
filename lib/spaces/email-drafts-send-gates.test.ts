import { describe, it, expect, beforeEach, vi } from 'vitest'

// SCAN-866: the block-email sends (sendSpaceEmailDraft, sendSpaceEmailDraftToRecipients) skipped three
// gates the plain campaign send runs: the campaigns-a-month meter (LIVE-751), the free plan's
// "Sent with Frequency" footer line, and SCAN-704's rule that a send reaching nobody is not stamped
// sent. Network-free: the seam, the meter, the audience and the database are mocked.

let plan: string | null = 'free'
let meterOk = true
let sentCount = 1
const seamCalls: { html: string }[] = []
const writes: Record<string, unknown>[] = []
// The one draft row, stateful so the LIVE-2329 claim can be raced.
let rowStatus = 'draft'

vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async (id: string) => ({
    id, slug: 'river-studio', name: 'River Studio', brandName: 'River Studio', ownerProfileId: 'owner-1', status: 'active', plan,
  }),
}))
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => 'editor-1',
  getCallerProfile: async () => ({ id: 'editor-1' }),
  getCachedUser: async () => null,
}))
vi.mock('@/lib/spaces/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/lib/spaces/entitlements')>()),
  getSpaceCapabilities: async () => ({ canEditProfile: true, role: 'admin' }),
}))
vi.mock('@/lib/spaces/counted-meters', () => ({
  checkCampaignMonthMeter: async () => (meterOk ? { ok: true } : { ok: false, error: 'Your plan includes 2 campaigns a month.' }),
}))
vi.mock('@/lib/spaces/audiences', () => ({
  resolveAudience: async () => [{ email: 'a@b.com' }],
  listAudienceTags: async () => [],
}))
vi.mock('@/lib/spaces/email', async (orig) => ({
  ...(await orig<typeof import('@/lib/spaces/email')>()),
  sendSpaceCampaign: async (_spaceId: string, input: { html: string }) => {
    seamCalls.push(input)
    await new Promise((r) => setTimeout(r, 5))
    return { data: { sent: sentCount, suppressed: sentCount ? 0 : 1, failed: 0 } }
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from() {
      let patch: Record<string, unknown> | null = null
      let statusIn: string[] | null = null
      const apply = () => {
        if (!patch) return false
        if (statusIn && !statusIn.includes(rowStatus)) return false
        writes.push(patch)
        if (typeof patch.status === 'string') rowStatus = patch.status
        return true
      }
      const api: Record<string, unknown> = {
        select: () => api,
        update: (value: Record<string, unknown>) => { patch = value; return api },
        eq: (col: string, val: string) => { if (col === 'status') statusIn = [val]; return api },
        in: (col: string, vals: string[]) => { if (col === 'status') statusIn = vals; return api },
        maybeSingle: () =>
          Promise.resolve(
            patch
              ? { data: apply() ? { id: 'draft-1' } : null, error: null }
              : { data: { id: 'draft-1', subject: 'Spring', preheader: '', block_json: null, status: rowStatus, space_id: 'space-A' }, error: null },
          ),
        then: (resolve: (r: unknown) => unknown) => { apply(); return Promise.resolve(resolve({ data: null, error: null })) },
      }
      return api
    },
  }),
}))

import { sendSpaceEmailDraft, sendSpaceEmailDraftToRecipients } from './email-drafts'

beforeEach(() => {
  plan = 'free'
  meterOk = true
  sentCount = 1
  seamCalls.length = 0
  writes.length = 0
  rowStatus = 'draft'
})

const sends = [
  ['sendSpaceEmailDraft', () => sendSpaceEmailDraft('space-A', 'draft-1')],
  ['sendSpaceEmailDraftToRecipients', () => sendSpaceEmailDraftToRecipients('space-A', 'draft-1', [{ email: 'a@b.com' }])],
] as const

describe.each(sends)('%s runs the plain send gates (SCAN-866)', (_name, send) => {
  it('stops at the campaigns-a-month meter and sends nothing', async () => {
    meterOk = false
    expect(await send()).toEqual({ error: 'Your plan includes 2 campaigns a month.' })
    expect(seamCalls).toHaveLength(0)
  })

  it('a free Space carries the Sent with Frequency line; a paid one does not', async () => {
    await send()
    expect(seamCalls[0].html).toContain('Sent with <a')
    plan = 'business'
    rowStatus = 'draft' // the first send stamped it sent; start the paid run from a fresh draft
    await send()
    expect(seamCalls[1].html).not.toContain('Sent with <a')
  })

  it('a send that reached nobody fails and is not stamped sent', async () => {
    sentCount = 0
    expect(await send()).toEqual({ error: 'Nobody on this list has opted in to email yet, so nothing was sent.' })
    expect(writes.some((w) => w.status === 'sent')).toBe(false)
    // LIVE-2329: the claim is handed back, so the owner can fix the list and send again.
    expect(rowStatus).toBe('draft')
  })

  it('two presses at once send once; the second is refused (LIVE-2329)', async () => {
    const [a, b] = await Promise.all([send(), send()])
    expect(seamCalls).toHaveLength(1)
    expect([a, b].filter((r) => 'error' in r)).toEqual([{ error: 'This email is already going out, or has gone out.' }])
    expect(rowStatus).toBe('sent')
  })

  it('a row another send already holds is never sent again (LIVE-2329)', async () => {
    rowStatus = 'sending'
    expect(await send()).toEqual({ error: 'This email is already going out, or has gone out.' })
    expect(seamCalls).toHaveLength(0)
  })
})

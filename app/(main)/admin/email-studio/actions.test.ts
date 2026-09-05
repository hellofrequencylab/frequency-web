import { describe, it, expect, vi, beforeEach } from 'vitest'

// saveEmailCampaign: the Email Studio's debounced field + layout autosave. What is locked here
// (scan2 L5-11): EVERY write reads its { error } and a refusal is RETURNED, never swallowed. The
// subject / preheader write always was; the From-name and reply-mode writes were "best-effort"
// (unread) from before their columns shipped, so a refused From name or reply mode returned {} and
// the editor showed the operator a value that was not on file. Network-free: the gate, the admin
// client and the send-side helpers are stubbed.

const mocks = vi.hoisted(() => ({
  writerGate: vi.fn(),
}))

vi.mock('@/lib/outbound/guard', () => ({ writerGate: mocks.writerGate }))
vi.mock('@/lib/admin/guard', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCachedUser: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendRawEmail: vi.fn() }))
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://example.test' }))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => '', buildManageEmailsUrl: () => '' }))
vi.mock('@/lib/studio/campaigns', () => ({ BUILTIN_SEGMENTS: [], TRAIT_SEGMENT_PREFIX: 'seg:' }))
vi.mock('@/lib/email-studio/send', () => ({
  sanitizeFromName: (v: string) => v.trim(),
  loadCampaignFromName: vi.fn(),
  loadCampaignReplyMode: vi.fn(),
  resolveCampaignFromHeader: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── A recording admin client: every campaigns.update payload is logged in order, and a payload
// KEY (from_name / reply_mode / subject) can be told to refuse. ──────────────────────────────
const updates: Array<Record<string, unknown>> = []
const refuse = new Set<string>()

function builder() {
  const api: Record<string, unknown> = {}
  let error: { message: string } | null = null
  api.update = (payload: Record<string, unknown>) => {
    updates.push(payload)
    error = Object.keys(payload).some((k) => refuse.has(k)) ? { message: 'refused' } : null
    return api
  }
  api.select = () => api
  api.eq = () => api
  api.maybeSingle = async () => ({ data: { subject: 'On file', preheader: '' }, error: null })
  api.then = (resolve: (r: { error: unknown }) => unknown) => Promise.resolve(resolve({ error }))
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

import { saveEmailCampaign } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  refuse.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.writerGate.mockResolvedValue({ ok: true, profileId: 'op-1' })
})

describe('saveEmailCampaign', () => {
  it('a landed subject save returns {} (the ok shape the store and the editor read)', async () => {
    expect(await saveEmailCampaign('c1', { subject: 'New subject' })).toEqual({})
    expect(updates).toEqual([{ subject: 'New subject' }])
  })

  it('a REFUSED subject save is returned, not swallowed', async () => {
    refuse.add('subject')
    expect(await saveEmailCampaign('c1', { subject: 'New subject' })).toEqual({
      error: 'Could not save your email. Try again.',
    })
  })

  it('a REFUSED From-name write is returned (it used to be an unread best-effort write)', async () => {
    refuse.add('from_name')
    expect(await saveEmailCampaign('c1', { fromName: 'Sunrise Crew' })).toEqual({
      error: 'Could not save the From name. Try again.',
    })
    expect(updates).toEqual([{ from_name: 'Sunrise Crew' }])
  })

  it('a REFUSED reply-mode write is returned (same, and it stops before the field write)', async () => {
    refuse.add('reply_mode')
    expect(await saveEmailCampaign('c1', { replyMode: 'conversation', subject: 'Typed after' })).toEqual({
      error: 'Could not save the reply setting. Try again.',
    })
    // The refusal is answered first; the subject write is not attempted on top of it.
    expect(updates).toEqual([{ reply_mode: 'conversation' }])
  })

  it('the writer gate refusal still comes back as { error } with no write', async () => {
    mocks.writerGate.mockResolvedValue({ ok: false, error: 'Not allowed.' })
    expect(await saveEmailCampaign('c1', { subject: 'x' })).toEqual({ error: 'Not allowed.' })
    expect(updates).toEqual([])
  })
})

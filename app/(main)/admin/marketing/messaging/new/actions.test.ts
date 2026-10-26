import { describe, it, expect, beforeEach, vi } from 'vitest'

// GUIDED-SETUP MANUAL CAMPAIGN PATH. The bug: the manual "Build it -> Campaign" branch routed to
// /admin/crm/marketing?segment=<key>, but that page reads ONLY ?open=, so no draft was created and the
// operator's entered name/audience/notes were silently discarded (a dead end). This locks the fix: the
// manual campaign branch now MINTS a `campaigns` draft carrying those inputs and routes ?open=<id>, mirroring
// the sibling paths (manual funnel createFunnel+opens; Vera campaign insertCampaignDraft+opens).

const h = vi.hoisted(() => {
  const state = { insertRow: null as Record<string, unknown> | null, insertError: null as unknown }
  const admin = {
    from() {
      const c: Record<string, unknown> = {
        insert: (row: Record<string, unknown>) => {
          state.insertRow = row
          return c
        },
        select: () => c,
        single: async () => ({ data: state.insertError ? null : { id: 'draft-1' }, error: state.insertError }),
      }
      return c
    },
  }
  return { state, admin }
})

vi.mock('@/lib/messaging/goals', () => ({ getMessagingGoal: vi.fn() }))
vi.mock('@/app/(main)/admin/growth/funnels/actions', () => ({ createFunnel: vi.fn() }))
vi.mock('@/lib/outbound/guard', () => ({ writerGate: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/ai/messaging-generator', () => ({
  coachMessaging: vi.fn(),
}))
vi.mock('@/lib/email-studio/shell', () => ({ compileEmailDoc: vi.fn(() => ({ html: '' })) }))

import { getMessagingGoal } from '@/lib/messaging/goals'
import { writerGate } from '@/lib/outbound/guard'
import { startBuild } from './actions'
import { coachMessaging } from '@/lib/ai/messaging-generator'

const campaignGoal = { key: 'welcome', label: 'Welcome', object: 'campaign', blurb: 'Say hi', outline: undefined }

beforeEach(() => {
  vi.clearAllMocks()
  h.state.insertRow = null
  h.state.insertError = null
  vi.mocked(getMessagingGoal).mockReturnValue(campaignGoal as never)
  vi.mocked(writerGate).mockResolvedValue({ ok: true, profileId: 'me', webRole: 'janitor' } as never)
})

describe('startBuild — manual campaign mints a draft and opens it (no dead end)', () => {
  it('inserts a draft carrying name/segment/notes and returns href ?open=<id>', async () => {
    const res = await startBuild({
      goalKey: 'welcome',
      name: 'Spring launch',
      audience: 'all-members',
      details: 'mention the retreat',
      mode: 'manual',
    })
    expect(res).toEqual({ data: { href: '/admin/crm/marketing?open=draft-1', veraPending: false } })
    // The operator's inputs are preserved on the draft, not discarded.
    expect(h.state.insertRow).toMatchObject({
      subject: 'Spring launch',
      segment: 'all-members',
      preheader: 'mention the retreat',
      status: 'draft',
      created_by: 'me',
    })
  })
  it('is gated: a denied writer mints nothing', async () => {
    vi.mocked(writerGate).mockResolvedValue({ ok: false, error: 'Marketer access required.' } as never)
    const res = await startBuild({ goalKey: 'welcome', name: 'Blocked', mode: 'manual' })
    expect('error' in res).toBe(true)
    expect(h.state.insertRow).toBeNull()
  })
  it('surfaces a save failure instead of a dead-end redirect', async () => {
    h.state.insertError = { message: 'boom' }
    const res = await startBuild({ goalKey: 'welcome', name: 'Oops', mode: 'manual' })
    expect('error' in res).toBe(true)
  })
})


describe('Vera coaching never persists generated content', () => {
  it('returns guidance without creating a campaign or losing the author notes', async () => {
    const coaching = { questions: ['Who should take the next step?'], checks: ['Check the real date.'], measurement: 'Count attended bookings, not just opens.' }
    vi.mocked(coachMessaging).mockResolvedValue(coaching)
    const res = await startBuild({ goalKey: 'welcome', name: 'My title', details: 'My own message', mode: 'vera' })
    expect(res).toEqual({ data: { href: '', veraPending: false, coaching } })
    expect(h.state.insertRow).toBeNull()
    expect(coachMessaging).toHaveBeenCalledWith(expect.objectContaining({ name: 'My title', details: 'My own message', profileId: 'me' }))
  })
  it('does not create a fallback draft when coaching is unavailable', async () => {
    vi.mocked(coachMessaging).mockResolvedValue(null)
    expect(await startBuild({ goalKey: 'welcome', name: 'My title', mode: 'vera' })).toHaveProperty('error')
    expect(h.state.insertRow).toBeNull()
  })
  it('denies an unauthorized caller before coaching or writes', async () => {
    vi.mocked(writerGate).mockResolvedValue({ ok: false, error: 'Denied' } as never)
    expect(await startBuild({ goalKey: 'welcome', name: 'My title', mode: 'vera' })).toHaveProperty('error')
    expect(coachMessaging).not.toHaveBeenCalled()
    expect(h.state.insertRow).toBeNull()
  })
})

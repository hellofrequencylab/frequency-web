import { beforeEach, describe, expect, it, vi } from 'vitest'

// THE JOURNEY LAUNCH ACTIONS (ADR-840). Holds still: every action re-resolves the caller's launch
// context before anything else, the tier subset is re-applied server-side, a Journey with no Space
// schedules nothing, a series reports exactly which keys landed, and the enrollee message lane
// refuses every channel but the in-app DM and never messages the sender.

const m = vi.hoisted(() => ({
  caller: { id: 'viewer-1', community_role: 'member', webRole: null, membershipTier: 'free', realMembershipTier: 'free' } as Record<string, unknown> | null,
  ctx: null as null | { slug: string; title: string; spaceId: string | null; viewerId: string; access: { launchCampaignsAllowed: boolean } },
  parseOk: true,
  createCampaign: vi.fn(),
  scheduleCampaign: vi.fn(),
  sendCampaign: vi.fn(),
  createFunnel: vi.fn(),
  addStageLink: vi.fn(),
  getFunnel: vi.fn(),
  sendBulkDm: vi.fn(),
  route: vi.fn(),
  rateOk: true,
  enrollments: [] as { profile_id: string; completed_at: string | null }[],
  feedRows: [] as Record<string, unknown>[],
  feedOk: true,
  revalidate: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => m.revalidate(p) }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => m.caller }))
vi.mock('@/lib/journeys/launch-access', () => ({ resolveJourneyLaunchContext: async () => m.ctx }))
vi.mock('@/lib/spaces/campaigns', () => ({
  createSpaceCampaign: (...a: unknown[]) => m.createCampaign(...a),
  scheduleSpaceCampaign: (...a: unknown[]) => m.scheduleCampaign(...a),
  sendSpaceCampaign: (...a: unknown[]) => m.sendCampaign(...a),
  parseScheduleTime: () => (m.parseOk ? new Date('2026-11-10T18:00:00Z') : null),
}))
vi.mock('@/app/(main)/admin/growth/funnels/actions', () => ({
  createFunnel: (...a: unknown[]) => m.createFunnel(...a),
  addStageLink: (...a: unknown[]) => m.addStageLink(...a),
}))
vi.mock('@/lib/funnels/store', () => ({ getFunnel: (...a: unknown[]) => m.getFunnel(...a) }))
vi.mock('@/lib/comms/bulk-dm', () => ({ sendBulkDm: (...a: unknown[]) => m.sendBulkDm(...a) }))
vi.mock('@/lib/notifications/router', () => ({ routeNotification: (...a: unknown[]) => m.route(...a) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: async () => m.rateOk }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: m.enrollments }) }),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          maybeSingle: async () => {
            if (!m.feedOk) return { data: null }
            m.feedRows.push(row)
            return { data: { id: 'dispatch-1' } }
          },
        }),
      }),
    }),
  }),
}))

import {
  buildLaunchFunnelAction,
  scheduleLaunchSendAction,
  scheduleLaunchSeriesAction,
  sendJourneyBroadcastAction,
} from './actions'
import { LAUNCH_NEEDS_SPACE_MESSAGE, LAUNCH_SERIES_LOCKED_ERROR } from '@/lib/journeys/launch-surface'

const send = (key: string) => ({ key, subject: 'S', body: 'B', sendAt: '2026-11-10T18:00:00Z' })

function ctx(over: Partial<NonNullable<typeof m.ctx>> = {}, paid = true) {
  return { slug: 'sunrise', title: 'Sunrise', spaceId: 'space-1', viewerId: 'viewer-1', access: { launchCampaignsAllowed: paid }, ...over }
}

beforeEach(() => {
  vi.clearAllMocks()
  m.caller = { id: 'viewer-1', community_role: 'member', webRole: null, membershipTier: 'free', realMembershipTier: 'free' }
  m.ctx = ctx()
  m.parseOk = true
  m.enrollments = []
  m.feedRows = []
  m.feedOk = true
  m.rateOk = true
  m.route.mockReset()
  m.createCampaign.mockImplementation(async () => ({ data: { id: `c-${m.createCampaign.mock.calls.length}` } }))
  m.scheduleCampaign.mockResolvedValue({ data: undefined })
  m.sendCampaign.mockResolvedValue({ data: { recipientCount: 3 } })
  m.createFunnel.mockResolvedValue({ data: { id: 'f-1' } })
  m.getFunnel.mockResolvedValue({ stages: [{ id: 's1' }, { id: 's2' }] })
  m.addStageLink.mockResolvedValue({ data: undefined })
  m.sendBulkDm.mockResolvedValue({ sent: 2, detail: 'Sent to 2.' })
})

describe('scheduleLaunchSendAction', () => {
  it('turns away a signed-out caller and a caller who cannot edit the Journey, before touching campaigns', async () => {
    m.caller = null
    expect(await scheduleLaunchSendAction('plan-1', send('announce'))).toEqual({ error: 'Sign in to launch this Journey.' })
    m.caller = { id: 'viewer-1' }
    m.ctx = null
    expect(await scheduleLaunchSendAction('plan-1', send('announce'))).toEqual({ error: 'Only the author or the Space team can launch this Journey.' })
    expect(m.createCampaign).not.toHaveBeenCalled()
  })

  it('refuses a key outside the series and a paid key on the free tier', async () => {
    expect(await scheduleLaunchSendAction('plan-1', send('bogus'))).toEqual({ error: 'That is not part of the launch series.' })
    m.ctx = ctx({}, false)
    expect(await scheduleLaunchSendAction('plan-1', send('kickoff'))).toEqual({ error: LAUNCH_SERIES_LOCKED_ERROR })
    expect(m.createCampaign).not.toHaveBeenCalled()
  })

  it('lets the free tier schedule the announce only', async () => {
    m.ctx = ctx({}, false)
    const res = await scheduleLaunchSendAction('plan-1', send('announce'))
    expect(res).toEqual({ data: { campaignId: 'c-1' } })
  })

  it('schedules nothing for a Journey with no Space, or for a send time in the past', async () => {
    m.ctx = ctx({ spaceId: null })
    expect(await scheduleLaunchSendAction('plan-1', send('announce'))).toEqual({ error: LAUNCH_NEEDS_SPACE_MESSAGE })
    m.ctx = ctx()
    m.parseOk = false
    expect(await scheduleLaunchSendAction('plan-1', send('announce'))).toEqual({ error: 'Pick a send time in the future.' })
    expect(m.createCampaign).not.toHaveBeenCalled()
  })

  it('writes a marketing-topic campaign in the Journey Space, schedules it, and revalidates the page', async () => {
    const res = await scheduleLaunchSendAction('plan-1', send('announce'))
    expect(res).toEqual({ data: { campaignId: 'c-1' } })
    expect(m.createCampaign).toHaveBeenCalledWith('space-1', { subject: 'S', body: 'B', topic: 'marketing' })
    expect(m.scheduleCampaign).toHaveBeenCalledWith('space-1', 'c-1', '2026-11-10T18:00:00Z')
    expect(m.revalidate).toHaveBeenCalledWith('/journeys/sunrise/launch')
  })

  it('passes the campaign machinery its own error through and never schedules a draft that failed', async () => {
    m.createCampaign.mockResolvedValue({ error: 'Subject is required.' })
    expect(await scheduleLaunchSendAction('plan-1', send('announce'))).toEqual({ error: 'Subject is required.' })
    expect(m.scheduleCampaign).not.toHaveBeenCalled()
  })
})

describe('scheduleLaunchSeriesAction', () => {
  it('reports exactly which keys landed and which failed, without aborting the rest', async () => {
    m.ctx = ctx({}, false) // free tier: only announce is allowed
    const res = await scheduleLaunchSeriesAction('plan-1', [send('announce'), send('kickoff')])
    expect(res).toEqual({ data: { scheduled: [{ key: 'announce', campaignId: 'c-1' }], failed: ['kickoff'] } })
  })

  it('fails with the last reason when nothing could be scheduled', async () => {
    m.ctx = ctx({}, false)
    expect(await scheduleLaunchSeriesAction('plan-1', [send('kickoff')])).toEqual({ error: LAUNCH_SERIES_LOCKED_ERROR })
    expect(await scheduleLaunchSeriesAction('plan-1', [])).toEqual({ error: 'Nothing could be scheduled. Check the send times.' })
  })

  it('turns away a caller who cannot launch before looking at any send', async () => {
    m.ctx = null
    expect(await scheduleLaunchSeriesAction('plan-1', [send('announce')])).toHaveProperty('error')
    expect(m.createCampaign).not.toHaveBeenCalled()
  })
})

describe('buildLaunchFunnelAction', () => {
  it('needs at least one scheduled campaign', async () => {
    expect(await buildLaunchFunnelAction('plan-1', ['', '  '])).toEqual({ error: 'Schedule at least one send first, then build the funnel.' })
    expect(m.createFunnel).not.toHaveBeenCalled()
  })

  it('links campaigns to stages in order and stops at the stages it has', async () => {
    const res = await buildLaunchFunnelAction('plan-1', ['c1', 'c2', 'c3'])
    expect(res).toEqual({ data: { funnelId: 'f-1', linked: 2 } })
    expect(m.createFunnel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sunrise launch', goalEvent: 'signup' }))
    expect(m.addStageLink.mock.calls.map((c) => c[0])).toEqual([
      { stageId: 's1', refType: 'campaign', refId: 'c1' },
      { stageId: 's2', refType: 'campaign', refId: 'c2' },
    ])
  })

  it('counts only the links that took', async () => {
    m.addStageLink.mockResolvedValueOnce({ error: 'no' }).mockResolvedValueOnce({ data: undefined })
    expect(await buildLaunchFunnelAction('plan-1', ['c1', 'c2'])).toEqual({ data: { funnelId: 'f-1', linked: 1 } })
  })
})

describe('sendJourneyBroadcastAction', () => {
  const input = (over: Record<string, unknown> = {}) => ({ body: 'Hello', subject: '', channels: ['dm'], segments: ['all'], ...over }) as never

  it('needs a message and a channel', async () => {
    expect(await sendJourneyBroadcastAction('plan-1', input({ body: '   ' }))).toEqual({ error: 'Write your message first.' })
    expect(await sendJourneyBroadcastAction('plan-1', input({ channels: [] }))).toEqual({ error: 'Pick at least one channel.' })
  })

  it('refuses text with an honest reason, and sends nothing when DM was not picked', async () => {
    const res = await sendJourneyBroadcastAction('plan-1', input({ channels: ['sms'] }))
    expect(res).toMatchObject({ data: { results: [{ channel: 'sms', ok: false, detail: 'Text is not available yet.' }] } })
    expect(m.sendBulkDm).not.toHaveBeenCalled()
    expect(m.createCampaign).not.toHaveBeenCalled()
    expect(m.route).not.toHaveBeenCalled()
  })

  describe('dispatch (push to the cohort)', () => {
    const dispatch = (over: Record<string, unknown> = {}) => input({ channels: ['dispatch'], subject: 'Heads up', ...over })

    it('routes one push per picked enrollee, never the sender, under the Space mute subject', async () => {
      m.enrollments = [
        { profile_id: 'a', completed_at: null },
        { profile_id: 'b', completed_at: '2026-10-01T00:00:00Z' },
        { profile_id: 'viewer-1', completed_at: null },
      ]
      m.route.mockResolvedValue({ enqueuedCount: 1 })
      const res = await sendJourneyBroadcastAction('plan-1', dispatch({ segments: ['in_progress'] }))
      expect(m.route).toHaveBeenCalledTimes(1)
      expect(m.route).toHaveBeenCalledWith(
        'event.dispatch',
        { profileId: 'a', subject: { subjectType: 'space', subjectId: 'space-1' } },
        { title: 'Heads up', body: 'Hello', url: '/journeys/sunrise' },
      )
      expect(res).toEqual({ data: { results: [{ channel: 'dispatch', ok: true, detail: 'Pushed to 1 person with push on.' }] } })
      expect(m.sendBulkDm).not.toHaveBeenCalled()
    })

    it('counts only people the router actually enqueued, and says so when it is no one', async () => {
      m.enrollments = [{ profile_id: 'a', completed_at: null }, { profile_id: 'b', completed_at: null }]
      m.route.mockResolvedValueOnce({ enqueuedCount: 1 }).mockResolvedValueOnce({ enqueuedCount: 0 })
      const some = await sendJourneyBroadcastAction('plan-1', dispatch())
      expect(some).toMatchObject({ data: { results: [{ channel: 'dispatch', ok: true }] } })
      // A half-cohort send posts no feed row, so no push means nothing went out at all.
      m.route.mockResolvedValue({ enqueuedCount: 0 })
      const none = await sendJourneyBroadcastAction('plan-1', dispatch({ segments: ['in_progress'] }))
      expect(none).toMatchObject({ data: { results: [{ channel: 'dispatch', ok: false, detail: 'No one has push on for this, so nothing went out.' }] } })
    })

    it('skips a recipient the router throws on and still reaches the rest', async () => {
      m.enrollments = [{ profile_id: 'a', completed_at: null }, { profile_id: 'b', completed_at: null }]
      m.route.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ enqueuedCount: 1 })
      const res = await sendJourneyBroadcastAction('plan-1', dispatch())
      expect(res).toMatchObject({ data: { results: [{ channel: 'dispatch', ok: true }] } })
    })

    it('posts a Journey-scoped feed row for the whole cohort and says so', async () => {
      m.enrollments = [{ profile_id: 'a', completed_at: null }]
      m.route.mockResolvedValue({ enqueuedCount: 1 })
      const res = await sendJourneyBroadcastAction('plan-1', dispatch({ segments: ['all'] }))
      expect(m.feedRows).toEqual([
        expect.objectContaining({
          author_id: 'viewer-1',
          title: 'Heads up',
          body: 'Hello',
          audience_scope: 'journey',
          audience_id: 'plan-1',
          status: 'published',
        }),
      ])
      expect(res).toEqual({
        data: { results: [{ channel: 'dispatch', ok: true, detail: 'Posted to their feed. Pushed to 1 person with push on.' }] },
      })
    })

    it('posts to the feed for both halves, but not for just one half', async () => {
      m.enrollments = [{ profile_id: 'a', completed_at: null }, { profile_id: 'b', completed_at: '2026-10-01T00:00:00Z' }]
      m.route.mockResolvedValue({ enqueuedCount: 1 })
      await sendJourneyBroadcastAction('plan-1', dispatch({ segments: ['in_progress', 'finished'] }))
      expect(m.feedRows).toHaveLength(1)
      await sendJourneyBroadcastAction('plan-1', dispatch({ segments: ['finished'] }))
      expect(m.feedRows).toHaveLength(1)
    })

    it('still succeeds when push reaches no one but the feed row was posted', async () => {
      m.enrollments = [{ profile_id: 'a', completed_at: null }]
      m.route.mockResolvedValue({ enqueuedCount: 0 })
      const res = await sendJourneyBroadcastAction('plan-1', dispatch({ segments: ['all'] }))
      expect(res).toEqual({
        data: { results: [{ channel: 'dispatch', ok: true, detail: 'Posted to their feed. No one has push on, so nothing was pushed.' }] },
      })
    })

    it('refuses an empty audience and a rate-limited sender before routing anything', async () => {
      m.enrollments = []
      expect(await sendJourneyBroadcastAction('plan-1', dispatch())).toMatchObject({
        data: { results: [{ channel: 'dispatch', ok: false, detail: 'No one in that audience yet.' }] },
      })
      m.enrollments = [{ profile_id: 'a', completed_at: null }]
      m.rateOk = false
      expect(await sendJourneyBroadcastAction('plan-1', dispatch())).toMatchObject({
        data: { results: [{ channel: 'dispatch', ok: false }] },
      })
      expect(m.route).not.toHaveBeenCalled()
    })

    it('omits the mute subject when the Journey has no Space', async () => {
      m.ctx = ctx({ spaceId: null })
      m.enrollments = [{ profile_id: 'a', completed_at: null }]
      m.route.mockResolvedValue({ enqueuedCount: 1 })
      await sendJourneyBroadcastAction('plan-1', dispatch())
      expect(m.route.mock.calls[0][1]).toEqual({ profileId: 'a' })
    })
  })

  it('messages only the picked segments, never the sender, each person once', async () => {
    m.enrollments = [
      { profile_id: 'a', completed_at: null },
      { profile_id: 'b', completed_at: '2026-10-01T00:00:00Z' },
      { profile_id: 'viewer-1', completed_at: null },
      { profile_id: 'a', completed_at: null },
    ]
    await sendJourneyBroadcastAction('plan-1', input({ segments: ['in_progress'] }))
    expect(m.sendBulkDm.mock.calls[0][0].recipientProfileIds).toEqual(['a'])
    await sendJourneyBroadcastAction('plan-1', input({ segments: ['finished'] }))
    expect(m.sendBulkDm.mock.calls[1][0].recipientProfileIds).toEqual(['b'])
    await sendJourneyBroadcastAction('plan-1', input({ segments: ['all', 'bogus'] }))
    expect(m.sendBulkDm.mock.calls[2][0].recipientProfileIds).toEqual(['a', 'b'])
  })

  it('tags the thread with the journey lane, falls back to the title as the subject, and reports the send', async () => {
    m.enrollments = [{ profile_id: 'a', completed_at: null }]
    const res = await sendJourneyBroadcastAction('plan-1', input())
    expect(m.sendBulkDm).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'viewer-1', subject: 'Sunrise', spaceId: 'space-1', scope: { kind: 'journey', id: 'plan-1' } }),
    )
    expect(res).toEqual({ data: { results: [{ channel: 'dm', ok: true, detail: 'Sent to 2.' }] } })
  })

  it('says so when nobody is in the audience, and does not call the sender', async () => {
    m.enrollments = [{ profile_id: 'viewer-1', completed_at: null }]
    const res = await sendJourneyBroadcastAction('plan-1', input())
    expect(res).toEqual({ data: { results: [{ channel: 'dm', ok: false, detail: 'No one in that audience yet.' }] } })
    expect(m.sendBulkDm).not.toHaveBeenCalled()
  })

  describe('the email lane', () => {
    const email = (over: Record<string, unknown> = {}) => input({ channels: ['email'], subject: 'Week one', ...over })

    it('goes through the Space campaign lane as a journey member segment, under the marketing topic', async () => {
      const res = await sendJourneyBroadcastAction('plan-1', email())
      expect(m.createCampaign).toHaveBeenCalledWith('space-1', { subject: 'Week one', body: 'Hello', topic: 'marketing' })
      expect(m.sendCampaign).toHaveBeenCalledWith('space-1', 'c-1', { memberSegment: 'journey:plan-1' })
      expect(res).toMatchObject({ data: { results: [{ channel: 'email', ok: true, detail: 'Sent to 3 people who are subscribed to email from this Space.' }] } })
      expect(m.sendBulkDm).not.toHaveBeenCalled()
    })

    it('narrows the segment key to one half, and widens it back when both halves or everyone are picked', async () => {
      await sendJourneyBroadcastAction('plan-1', email({ segments: ['finished'] }))
      await sendJourneyBroadcastAction('plan-1', email({ segments: ['in_progress'] }))
      await sendJourneyBroadcastAction('plan-1', email({ segments: ['in_progress', 'finished'] }))
      await sendJourneyBroadcastAction('plan-1', email({ segments: ['all', 'bogus'] }))
      expect(m.sendCampaign.mock.calls.map((c) => c[2].memberSegment)).toEqual([
        'journey:plan-1:finished',
        'journey:plan-1:in_progress',
        'journey:plan-1',
        'journey:plan-1',
      ])
    })

    it('says so when the Journey has no Space, and writes no campaign', async () => {
      m.ctx = ctx({ spaceId: null })
      const res = await sendJourneyBroadcastAction('plan-1', email())
      expect(res).toMatchObject({ data: { results: [{ channel: 'email', ok: false, detail: LAUNCH_NEEDS_SPACE_MESSAGE }] } })
      expect(m.createCampaign).not.toHaveBeenCalled()
    })

    it('falls back to the Journey title as the subject, like the DM lane', async () => {
      await sendJourneyBroadcastAction('plan-1', email({ subject: '' }))
      expect(m.createCampaign.mock.calls[0][1].subject).toBe('Sunrise')
    })

    it('reports the send seam refusal (no opt-ins, email off, cap) as the result, never as a success', async () => {
      m.sendCampaign.mockResolvedValue({ error: 'Nobody on this list has opted in to email yet, so nothing was sent.' })
      const res = await sendJourneyBroadcastAction('plan-1', email())
      expect(res).toMatchObject({ data: { results: [{ channel: 'email', ok: false, detail: 'Nobody on this list has opted in to email yet, so nothing was sent.' }] } })
    })

    it('stops at a campaign that could not be written', async () => {
      m.createCampaign.mockResolvedValue({ error: 'Give your campaign a subject before sending.' })
      const res = await sendJourneyBroadcastAction('plan-1', email())
      expect(res).toMatchObject({ data: { results: [{ channel: 'email', ok: false }] } })
      expect(m.sendCampaign).not.toHaveBeenCalled()
    })

    it('lets email and DM go out together, each reporting on its own', async () => {
      m.enrollments = [{ profile_id: 'a', completed_at: null }]
      const res = await sendJourneyBroadcastAction('plan-1', email({ channels: ['email', 'dm'] }))
      expect(res).toMatchObject({ data: { results: [{ channel: 'email', ok: true }, { channel: 'dm', ok: true }] } })
    })
  })
})

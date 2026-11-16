// Synthetic fixture for render/interaction tests and explicitly labeled visual previews only.
import { BUILDER_STEP_EVENTS, type GrowthSnapshot } from '@/lib/analytics/growth'

export function growthDashboardFixture(overrides: Partial<GrowthSnapshot> = {}): GrowthSnapshot {
  const visits = [160, 120, 90, 75, 48, 30]
  const matureVisits = [140, 105, 80, 60, 35, 20]
  const labels = ['Opened the builder', 'Typed a name', 'Picked an accent', 'Mocked up the offer', 'Reported a save', 'Finished photos']
  return {
    computedAt: '2026-11-12T23:00:00Z', windowDays: 30,
    showingUp: 24, previousShowingUp: 16, guestsShowingUp: 6,
    rsvpEligible: 50, rsvpAttended: 35, firstAttendanceObserved: 18,
    timeToFirstMedianHours: 30, timeToFirstP90Hours: 96,
    newMembers: 60, savedDrafts: 25, repeatEligible: 40, repeatReturned: 14,
    builderPendingVisits: 20,
    measurement: { eventsInWindow: 120, signupEventsObserved: 60, signupEventsExpected: 60, leadEventsObserved: 25, leadEventsExpected: 25, unattributedSignups: 0, unattributedLeads: 0, futureEventRows: 0 },
    lastEventAt: '2026-11-12T22:59:30Z',
    weeklyAttendance: [4, 6, 8, 11, 9, 14, 16, 24],
    campaigns: [
      { campaign: 'Local invitations', source: 'newsletter', medium: 'email', converting_channel: 'email', signups: 40, eligible: 30, pending: 10, activated: 12 },
      { campaign: 'Host welcome', source: 'partners', medium: 'referral', converting_channel: 'referral', signups: 20, eligible: 12, pending: 8, activated: 4 },
    ],
    leadCampaigns: [{ campaign: 'Host welcome', source: 'partners', medium: 'referral', leads: 25, linked_members: 14, eligible: 20, pending: 5, attended: 7 }],
    recentEvents: [
      { event_type: 'account.created', events: 5, latest: '2026-11-12T22:59:30Z' },
      { event_type: 'event.rsvp', events: 3, latest: '2026-11-12T22:58:00Z' },
    ],
    builder: BUILDER_STEP_EVENTS.map((event_type, i) => ({ i: i + 1, label: labels[i], event_type, visits: visits[i], matureVisits: matureVisits[i] })),
    ...overrides,
  }
}

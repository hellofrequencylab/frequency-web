// Pure interpretation of an already authorized aggregate. No identities, database reads or AI calls.
import { BUILDER_STEP_EVENTS, measuredRate, type GrowthSnapshot } from './growth'

interface UserFlowStage {
  key: string
  label: string
  count: number | null
  unit: 'people' | 'leads' | 'visits' | 'events' | 'reservations'
  window: string
  detail: string
  state: 'observed' | 'pending' | 'not-measured'
}
interface UserFlowBuilderStep {
  key: string
  label: string
  visits: number
  matureVisits: number
  pendingVisits: number
  continuedRate: number | null
  lostMatureVisits: number | null
  evidence: 'ordered-mature' | 'pending' | 'none'
}
export interface UserFlowInvestigation {
  id: string
  kind: 'coverage' | 'measured-friction' | 'weak-signal' | 'follow-up'
  title: string
  evidence: string
  guidance: string
  affected: number | null
}
interface UserFlowReadout {
  stages: UserFlowStage[]
  builderSteps: UserFlowBuilderStep[]
  investigations: UserFlowInvestigation[]
  limitations: string[]
}

const BUILDER_LABELS = ['Opened the builder', 'Typed a name', 'Picked an accent', 'Mocked up the offer', 'Reported a save', 'Finished photos'] as const
const count = (n: number): number | null => Number.isSafeInteger(n) && n >= 0 ? n : null

/**
 * These stages describe different populations; their position is not a joined conversion funnel.
 * The builder is the one ordered path this snapshot proves: the SQL walks one tab key in order,
 * requires each marker within seven days of its opening, and nests matureVisits by that same opening.
 */
export function buildUserFlow(data: GrowthSnapshot): UserFlowReadout {
  const window = `Last ${data.windowDays} days`
  const m = data.measurement
  const leads = data.leadCampaigns.reduce((n, c) => n + c.leads, 0)
  const recent = data.recentEvents.reduce((n, e) => n + e.events, 0)
  const pageEvents = data.recentEvents.filter((e) => e.event_type === 'nav.page_view').reduce((n, e) => n + e.events, 0)
  const stages: UserFlowStage[] = [
    { key: 'arrivals', label: 'Visitor arrivals', count: null, unit: 'people', window, state: 'not-measured', detail: 'This first-party snapshot has no distinct anonymous arrival population. Builder visits and page-view events are not total visitors.' },
    { key: 'new-members', label: 'New Members', count: count(data.newMembers), unit: 'people', window, state: 'observed', detail: 'New Member records. They cannot be divided by anonymous builder visits to produce signup conversion.' },
    { key: 'leads', label: 'Captured leads', count: count(leads), unit: 'leads', window, state: 'observed', detail: 'Server-stored lead records, not qualified people or necessarily the same cohort as new Members.' },
    { key: 'builder', label: 'Builder entries', count: count(data.builder[0]?.visits ?? NaN), unit: 'visits', window, state: 'observed', detail: 'Ordered entry markers keyed by anonymous browser tab. A visit is not a person or a stored lead.' },
    { key: 'exploring', label: 'People exploring', count: null, unit: 'people', window: 'Last 30 minutes', state: 'not-measured', detail: `${pageEvents} accepted page-view events are recorded in this window. Distinct explorers, sessions and concurrent visitors are not supplied.` },
    { key: 'recent-actions', label: 'Recent accepted actions', count: count(recent), unit: 'events', window: 'Last 30 minutes', state: 'observed', detail: 'Event volume across the accepted stream. One person can create many events; a quiet stream does not prove nobody visited.' },
    { key: 'rsvps', label: 'Eligible reservations', count: count(data.rsvpEligible), unit: 'reservations', window, state: 'observed', detail: 'Member/event RSVP pairs for completed, non-cancelled events. These are reservations, not unique people.' },
    { key: 'rsvp-attendance', label: 'Reservations marked attended', count: data.rsvpEligible > 0 ? count(data.rsvpAttended) : null, unit: 'reservations', window, state: data.rsvpEligible > 0 ? 'observed' : 'not-measured', detail: `${data.rsvpAttended} of ${data.rsvpEligible} eligible reservations have a host mark. Missing host marking can undercount attendance.` },
    { key: 'showing-up', label: 'Members showing up', count: count(data.showingUp), unit: 'people', window: 'Last 7 days', state: 'observed', detail: 'Distinct Members with host-confirmed attendance at completed gatherings in this window. Gathering completion dates place the outcome in time; guests are separate and self check-ins do not count.' },
    { key: 'return', label: 'Members returning', count: data.repeatEligible > 0 ? count(data.repeatReturned) : null, unit: 'people', window: 'Complete 28-day follow-up', state: data.repeatEligible > 0 ? 'observed' : 'not-measured', detail: `${data.repeatReturned} of ${data.repeatEligible} eligible first attendees returned within 28 days, using gathering completion dates. Recent first attendees remain outside this mature cohort.` },
  ]

  const builderValid = data.builder.length === BUILDER_STEP_EVENTS.length && data.builder.every((s, i, all) =>
    s.event_type === BUILDER_STEP_EVENTS[i] && s.i === i + 1 && count(s.visits) !== null && count(s.matureVisits) !== null && s.matureVisits <= s.visits &&
    (i === 0 || (s.visits <= all[i - 1].visits && s.matureVisits <= all[i - 1].matureVisits)),
  ) && data.builderPendingVisits === data.builder[0].visits - data.builder[0].matureVisits
  const builderSteps: UserFlowBuilderStep[] = builderValid ? data.builder.map((s, i, all) => ({
    key: s.event_type, label: BUILDER_LABELS[i], visits: s.visits, matureVisits: s.matureVisits,
    pendingVisits: s.visits - s.matureVisits,
    continuedRate: i === 0 ? null : measuredRate(s.matureVisits, all[i - 1].matureVisits),
    lostMatureVisits: i === 0 || all[i - 1].matureVisits === 0 ? null : all[i - 1].matureVisits - s.matureVisits,
    evidence: s.matureVisits > 0 || (i > 0 && all[i - 1].matureVisits > 0) ? 'ordered-mature' : s.visits > 0 ? 'pending' : 'none',
  })) : []

  // Fixed triage ordering: source integrity before interpreting behavior. No invented impact score.
  const investigations: UserFlowInvestigation[] = []
  if (m.futureEventRows > 0) investigations.push({
    id: 'future-timestamps', kind: 'coverage', title: 'Check event clocks first', affected: m.futureEventRows,
    evidence: `${m.futureEventRows} event rows have future timestamps outside the accepted clock tolerance.`,
    guidance: 'Reconcile the source clock and accepted-event timestamps before interpreting the activity window.',
  })
  for (const [key, label, observed, expected] of [
    ['signup', 'new-member', m.signupEventsObserved, m.signupEventsExpected],
    ['lead', 'captured-lead', m.leadEventsObserved, m.leadEventsExpected],
  ] as const) {
    if (expected > observed) investigations.push({
      id: `${key}-coverage`, kind: 'coverage', title: `Reconcile ${label} tracking`, affected: expected - observed,
      evidence: `${observed} of ${expected} authoritative ${label} records have a matching semantic marker. This difference is a coverage gap, not user abandonment.`,
      guidance: 'Run one controlled action and reconcile its stored fact, identity and marker. Check instrumentation history and consent behavior before changing the visitor flow.',
    })
  }
  if (!data.lastEventAt) investigations.push({
    id: 'event-baseline', kind: 'coverage', title: 'Establish an accepted-event baseline', affected: null,
    evidence: 'No accepted first-party event timestamp is available. Zeros cannot distinguish quiet traffic from missing tracking.',
    guidance: 'Complete a controlled tracked action and verify its accepted marker before drawing behavioral conclusions.',
  })
  if (!builderValid) investigations.push({
    id: 'builder-contract', kind: 'coverage', title: 'Repair the ordered builder reading', affected: null,
    evidence: 'The builder counts do not form the declared nested mature cohort. Continuation rates are withheld.',
    guidance: 'Verify the aggregate contract and step order before using builder counts to prioritize a change.',
  })
  if (m.unattributedSignups > 0) investigations.push({
    id: 'member-attribution', kind: 'coverage', title: 'Check Member campaign attribution', affected: m.unattributedSignups,
    evidence: `${m.unattributedSignups} new Members have neither a known first-touch source nor a campaign.`,
    guidance: 'Follow a tagged campaign link through consent and signup. Preserve unknown attribution rather than treating it as direct traffic.',
  })
  if (m.unattributedLeads > 0) investigations.push({
    id: 'lead-attribution', kind: 'coverage', title: 'Check lead campaign attribution', affected: m.unattributedLeads,
    evidence: `${m.unattributedLeads} captured leads have neither a known first-touch source nor a campaign.`,
    guidance: 'Reconcile the campaign arrival and verified lead capture without placing contact details in URLs.',
  })
  const gaps = builderSteps.flatMap((s, i) => {
    const previous = i > 0 ? builderSteps[i - 1] : null
    if (!previous || builderSteps[0].matureVisits < 30 || previous.matureVisits === 0 || s.continuedRate === null || s.continuedRate > 0.6 || s.lostMatureVisits === null || s.lostMatureVisits < 10) return []
    const measured = s.matureVisits > 0 && data.lastEventAt !== null && m.futureEventRows === 0 && m.signupEventsObserved === m.signupEventsExpected && m.leadEventsObserved === m.leadEventsExpected
    return [{
      id: `builder-${i}`, kind: measured ? 'measured-friction' as const : 'weak-signal' as const,
      title: `Inspect the step: ${s.label}`, affected: s.lostMatureVisits,
      evidence: `${s.matureVisits} of ${previous.matureVisits} visits with a full seven-day follow-up recorded the next ordered step. ${s.lostMatureVisits} did not record it. This does not establish the cause.`,
      guidance: !measured ? 'Reconcile the known source coverage gaps, then verify this step during a controlled pass before treating its marker gap as friction or abandonment.' : 'Verify the step marker, then inspect errors and the visible next step. Propose one controlled change; do not label an aggregate gap as a proven usability cause.',
    }]
  }).sort((a, b) => b.affected - a.affected)
  investigations.push(...gaps)
  if (data.rsvpEligible >= 30 && data.rsvpAttended < data.rsvpEligible) investigations.push({
    id: 'attendance-marking', kind: 'weak-signal', title: 'Separate missed attendance from missing host marks', affected: data.rsvpEligible - data.rsvpAttended,
    evidence: `${data.rsvpAttended} of ${data.rsvpEligible} eligible reservations have a host-confirmed attendance mark. The remaining reservations are not proven no-shows.`,
    guidance: 'Check host marking coverage and cancellations before changing reminders or interpreting the gap as attendance friction.',
  })
  if (data.builderPendingVisits > 0) investigations.push({
    id: 'builder-follow-up', kind: 'follow-up', title: 'Let recent builder visits finish their follow-up', affected: data.builderPendingVisits,
    evidence: `${data.builderPendingVisits} builder entry visits still have less than seven days of follow-up. They are not completed failures.`,
    guidance: 'Keep recent visits separate from the mature continuation comparison and revisit after their observation window.',
  })
  if (data.newMembers > data.firstAttendanceObserved) investigations.push({
    id: 'first-attendance-follow-up', kind: 'follow-up', title: 'Observe the first attendance path', affected: data.newMembers - data.firstAttendanceObserved,
    evidence: `${data.firstAttendanceObserved} of ${data.newMembers} new Members have an observed first attendance. The others are awaiting an observed outcome, not classified as blocked.`,
    guidance: 'Check attendance coverage and the time each signup has had to participate before choosing an activation intervention.',
  })
  return {
    stages, builderSteps, investigations,
    limitations: [
      'These populations are separate readings, not one identity-linked funnel. Do not divide anonymous visits, lead records, Member records or reservations by one another.',
      'Recent actions are event counts, not distinct users, sessions, concurrent visitors or a record of every action. This aggregate does not establish route-level audience cleanliness.',
      'Builder comparisons use the same ordered tab-key cohort with a full seven-day follow-up. A reported builder save is not a verified or qualified lead.',
      'The 30 mature entry visits, 10 missing next-step markers and 40% gap thresholds are investigation triage rules, not significance tests or business benchmarks.',
      'Arrivals and distinct explorers are not supplied by this aggregate. Host marking and semantic-marker coverage remain measurement limitations.',
      'No card establishes why a person stopped, and no recommendation changes the site automatically.',
    ],
  }
}

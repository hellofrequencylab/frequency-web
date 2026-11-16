// Presentation-neutral aggregate contract. No database imports: safe for charts and exports.
import { z } from 'zod'

const count = z.number().int().nonnegative()
export const BUILDER_STEP_EVENTS = ['createspace.view', 'createspace.name_started', 'createspace.accent_picked', 'createspace.offer', 'createspace.lead', 'createspace.photos'] as const
export const growthSnapshotSchema = z.object({
  computedAt: z.string().datetime({ offset: true }),
  windowDays: z.number().int().min(1).max(90),
  showingUp: count,
  previousShowingUp: count,
  guestsShowingUp: count,
  rsvpEligible: count,
  rsvpAttended: count,
  timeToFirstMedianHours: z.number().nonnegative().nullable(),
  timeToFirstP90Hours: z.number().nonnegative().nullable(),
  firstAttendanceObserved: count,
  repeatEligible: count,
  repeatReturned: count,
  newMembers: count,
  savedDrafts: count,
  builderPendingVisits: count,
  measurement: z.object({
    eventsInWindow: count,
    signupEventsObserved: count, signupEventsExpected: count,
    leadEventsObserved: count, leadEventsExpected: count,
    unattributedSignups: count, unattributedLeads: count,
    futureEventRows: count,
  }),
  lastEventAt: z.string().datetime({ offset: true }).nullable(),
  weeklyAttendance: z.array(count).length(8),
  campaigns: z.array(z.object({
    source: z.string(), medium: z.string(), campaign: z.string(), converting_channel: z.string(),
    signups: count, eligible: count, pending: count, activated: count,
  })),
  leadCampaigns: z.array(z.object({
    source: z.string(), medium: z.string(), campaign: z.string(), leads: count,
    linked_members: count, eligible: count, pending: count, attended: count,
  })),
  recentEvents: z.array(z.object({ event_type: z.string(), events: count, latest: z.string().datetime({ offset: true }) })),
  builder: z.array(z.object({ i: count, label: z.string(), event_type: z.enum(BUILDER_STEP_EVENTS), visits: count, matureVisits: count })).length(6),
}).superRefine((data, ctx) => {
  if (data.repeatReturned > data.repeatEligible) ctx.addIssue({ code: 'custom', message: 'Invalid return population' })
  if (data.rsvpAttended > data.rsvpEligible || data.firstAttendanceObserved > data.newMembers) ctx.addIssue({ code: 'custom', message: 'Invalid attendance population' })
  if (data.campaigns.reduce((n, c) => n + c.signups, 0) !== data.newMembers) ctx.addIssue({ code: 'custom', message: 'Incomplete campaign populations' })
  for (const c of data.campaigns) {
    if (c.activated > c.eligible || c.eligible + c.pending !== c.signups) ctx.addIssue({ code: 'custom', message: 'Invalid signup population' })
  }
  for (const c of data.leadCampaigns) {
    if (c.attended > c.eligible || c.eligible + c.pending !== c.leads || c.linked_members > c.leads) ctx.addIssue({ code: 'custom', message: 'Invalid lead population' })
  }
  if (data.measurement.signupEventsObserved > data.measurement.signupEventsExpected || data.measurement.leadEventsObserved > data.measurement.leadEventsExpected) ctx.addIssue({ code: 'custom', message: 'Invalid marker coverage' })
  if (data.measurement.signupEventsExpected !== data.newMembers || data.measurement.leadEventsExpected !== data.leadCampaigns.reduce((n, c) => n + c.leads, 0)) ctx.addIssue({ code: 'custom', message: 'Incomplete coverage denominators' })
  if (data.measurement.unattributedSignups > data.newMembers || data.measurement.unattributedLeads > data.measurement.leadEventsExpected) ctx.addIssue({ code: 'custom', message: 'Invalid attribution coverage' })
  for (let i = 0; i < data.builder.length; i++) {
    const step = data.builder[i]
    if (step.i !== i + 1 || step.event_type !== BUILDER_STEP_EVENTS[i] || step.matureVisits > step.visits) ctx.addIssue({ code: 'custom', message: 'Invalid builder step contract' })
  }
  const builderStart = data.builder[0]
  if (!builderStart || data.builderPendingVisits !== builderStart.visits - builderStart.matureVisits) ctx.addIssue({ code: 'custom', message: 'Invalid builder follow-up population' })
  if (data.weeklyAttendance[7] !== data.showingUp) ctx.addIssue({ code: 'custom', message: 'Inconsistent weekly attendance' })
  if (data.lastEventAt !== null && Date.parse(data.lastEventAt) > Date.parse(data.computedAt)) ctx.addIssue({ code: 'custom', message: 'Invalid event timestamp' })
  if (data.recentEvents.some((event) => Date.parse(event.latest) > Date.parse(data.computedAt))) ctx.addIssue({ code: 'custom', message: 'Invalid activity timestamp' })
  if (data.firstAttendanceObserved === 0 && (data.timeToFirstMedianHours !== null || data.timeToFirstP90Hours !== null)) ctx.addIssue({ code: 'custom', message: 'Timing without observed attendees' })
  if (data.firstAttendanceObserved > 0 && (data.timeToFirstMedianHours === null || data.timeToFirstP90Hours === null || data.timeToFirstP90Hours < data.timeToFirstMedianHours)) ctx.addIssue({ code: 'custom', message: 'Invalid attendance timing' })
  for (let i = 1; i < data.builder.length; i++) {
    if (data.builder[i].visits > data.builder[i - 1].visits || data.builder[i].matureVisits > data.builder[i - 1].matureVisits) ctx.addIssue({ code: 'custom', message: 'Invalid ordered builder population' })
  }
})
export type GrowthSnapshot = z.infer<typeof growthSnapshotSchema>
export type GrowthReading = { state: 'available'; data: GrowthSnapshot } | { state: 'unavailable'; message: string }

/** A proportion needs a measured denominator and a valid subset. */
export function measuredRate(n: number, d: number): number | null {
  return Number.isFinite(n) && Number.isFinite(d) && n >= 0 && d > 0 && n <= d ? n / d : null
}

interface GrowthHealthAlert {
  id: string
  tone: 'watch' | 'unknown'
  title: string
  detail: string
}

/** Coverage is evidence to investigate, never proof that an emitter is broken or consent was absent. */
export function growthHealth(data: GrowthSnapshot, nowMs = Date.now()): {
  state: 'good' | 'watch' | 'unknown'
  alerts: GrowthHealthAlert[]
} {
  const alerts: GrowthHealthAlert[] = []
  const computedMs = Date.parse(data.computedAt)
  if (nowMs - computedMs > 2 * 60_000) alerts.push({
    id: 'stale-reading', tone: 'watch', title: 'The dashboard reading is stale',
    detail: 'This aggregate was computed more than two minutes ago. Refresh before using it to make a decision.',
  })
  if (data.lastEventAt === null) alerts.push({
    id: 'no-event-baseline', tone: 'unknown', title: 'No accepted event baseline',
    detail: 'No first-party event has been recorded. Verify a controlled action before interpreting zeros as visitor behavior.',
  })
  else if (computedMs - Date.parse(data.lastEventAt) > 60 * 60_000) alerts.push({
    id: 'quiet-stream', tone: 'unknown', title: 'The event stream is quiet',
    detail: 'No event was accepted in the hour before this reading. Low traffic and missing tracking are both possible; run a controlled action to distinguish them.',
  })
  const m = data.measurement
  if (m.signupEventsObserved < m.signupEventsExpected) alerts.push({
    id: 'signup-coverage', tone: 'watch', title: 'Signup marker coverage needs review',
    detail: `${m.signupEventsObserved} of ${m.signupEventsExpected} new Members have a matching account-created marker. Earlier instrumentation and unfinished auth callbacks can explain gaps; do not treat this as measured abandonment.`,
  })
  if (m.leadEventsObserved < m.leadEventsExpected) alerts.push({
    id: 'lead-coverage', tone: 'watch', title: 'Lead marker coverage needs review',
    detail: `${m.leadEventsObserved} of ${m.leadEventsExpected} captured leads have a matching verified lead marker. Older captures and uninstrumented flows may be included.`,
  })
  if (m.unattributedSignups || m.unattributedLeads) alerts.push({
    id: 'attribution-coverage', tone: 'watch', title: 'Some acquisition remains unattributed',
    detail: `${m.unattributedSignups} signups and ${m.unattributedLeads} captured leads lack both a campaign and source. This may reflect consent or direct arrivals, not a failed campaign.`,
  })
  if (m.futureEventRows) alerts.push({
    id: 'future-events', tone: 'watch', title: 'Event timestamps need review',
    detail: `${m.futureEventRows} ledger rows are dated more than five minutes ahead of the database clock. They are excluded from current-window reporting.`,
  })
  return { state: alerts.some((a) => a.tone === 'watch') ? 'watch' : alerts.length ? 'unknown' : 'good', alerts }
}

interface GrowthExperiment {
  id: string
  title: string
  evidence: string
  hypothesis: string
  primaryMetric: string
  guardrails: string
  evaluation: string
}

/** Investigation candidates, never causal claims or automatically published changes. */
export function growthExperiments(data: GrowthSnapshot): GrowthExperiment[] {
  const out: GrowthExperiment[] = []
  const first = data.builder[0]
  const last = data.builder.find((s) => s.event_type === 'createspace.lead')
  if (first && last && first.matureVisits >= 30 && last.matureVisits / first.matureVisits < 0.3) {
    out.push({
      id: 'builder-next-step', title: 'Test a clearer builder next step',
      evidence: `${last.matureVisits} of ${first.matureVisits} measured builder visits with a full seven-day follow-up reported a save, in order within seven days. This is a browser signal, not verified lead qualification.`,
      hypothesis: 'A shorter explanation beside the next-step control may help more visitors finish saving.',
      primaryMetric: 'Successful server-confirmed draft saves per eligible exposed builder visit.',
      guardrails: 'Form errors, accessibility, page speed, unsubscribes and eventual publication.',
      evaluation: 'Fix assignment per visitor, record exposure, preserve a control, and preselect the sample size and seven-day conversion window. Do not stop on an early uplift.',
    })
  }
  if (data.repeatEligible >= 30 && data.repeatReturned / data.repeatEligible < 0.3) {
    out.push({
      id: 'attendance-return', title: 'Test an easier way to return',
      evidence: `${data.repeatReturned} of ${data.repeatEligible} first attendees with a full 28-day follow-up attended again.`,
      hypothesis: 'A relevant next-event invitation after first attendance may make returning easier.',
      primaryMetric: 'Second host-confirmed attendance within 28 days of first attendance.',
      guardrails: 'Consent, opt-outs, cancellations, contact frequency and host marking coverage.',
      evaluation: 'Assign eligible first attendees to a stable control or invitation group. Wait for the full 28-day follow-up before comparing outcomes.',
    })
  }
  return out
}

/** Only coarse numbers and closed enums may enter the model, never campaign labels or member data. */
export function growthAiEvidence(data: GrowthSnapshot) {
  return {
    windowDays: data.windowDays, showingUp: data.showingUp, previousShowingUp: data.previousShowingUp,
    repeatEligible: data.repeatEligible, repeatReturned: data.repeatReturned,
    newMembers: data.newMembers, savedDrafts: data.savedDrafts,
    builderPendingVisits: data.builderPendingVisits,
    measurement: {
      eventsInWindow: data.measurement.eventsInWindow,
      signupEventsObserved: data.measurement.signupEventsObserved,
      signupEventsExpected: data.measurement.signupEventsExpected,
      leadEventsObserved: data.measurement.leadEventsObserved,
      leadEventsExpected: data.measurement.leadEventsExpected,
      unattributedSignups: data.measurement.unattributedSignups,
      unattributedLeads: data.measurement.unattributedLeads,
      futureEventRows: data.measurement.futureEventRows,
    },
    proposals: growthExperiments(data),
  }
}

/** Quoted CSV, including spreadsheet formula protection for operator-supplied campaign names. */
export function campaignCsv(data: GrowthSnapshot): string {
  const cell = (v: string | number) => {
    const text = String(v)
    const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }
  const rows: Array<Array<string | number>> = [
    ['computed_at', 'window_days', 'cohort', 'source', 'medium', 'campaign', 'converting_channel', 'entrants', 'eligible_7d', 'pending_7d', 'first_attendance_7d', 'spend'],
    ...data.campaigns.map((c) => [data.computedAt, data.windowDays, 'signups', c.source, c.medium, c.campaign, c.converting_channel, c.signups, c.eligible, c.pending, c.activated, '']),
    ...data.leadCampaigns.map((c) => [data.computedAt, data.windowDays, 'captured_leads', c.source, c.medium, c.campaign, 'unknown', c.leads, c.eligible, c.pending, c.attended, '']),
  ]
  return rows.map((r) => r.map(cell).join(',')).join('\r\n')
}

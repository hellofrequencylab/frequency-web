// The five journeys that decide the product's fate — named once, as a registry the
// analytics readout and the research protocol both read (UX-MATURITY-PLAN Lift 1a).
//
// THE POINT: no new tracking. The semantic ledger is already live — `engagement_events`
// (named business events, lib/analytics/events.ts) and `interaction_events` (the raw
// firehose + the anonymous vitals stream, ADR-166/ADR-922). This file only NAMES which
// existing markers prove which step, in order, so a funnel becomes a query instead of a
// bespoke dashboard. If a step needs a marker that does not exist yet, it is recorded
// here as `unimplemented` rather than faked — a registry that names a marker nobody
// emits is worse than no registry, so the gap is a first-class, reportable value.
//
// PURE. No DB, no IO. The read that runs these against the ledger is
// lib/analytics/insights-read.ts → the `journey_funnel` RPC, which takes the step spec
// FROM here (toFunnelSpec) so SQL never carries a second copy of the registry.
//
// NAMING NOTE: "Journey" is a locked product noun (a Quest's Mind/Body/Spirit unit —
// docs/NAMING.md). These are an INTERNAL analytics concept and must never surface to a
// member under that word; the operator readout calls them Funnels.

/** Which ledger table a step's marker lives in. */
export type JourneyStream = 'engagement' | 'interaction'

/**
 * How much of the marker is real, verified against prod on 2026-08-04:
 *  - `observed`      — the marker is emitted AND rows exist in the ledger today.
 *  - `emitted`       — an emitter exists in the codebase, but no rows have landed yet
 *                      (a beta-volume artifact, not a wiring gap).
 *  - `unimplemented` — nothing emits this marker. The step is a KNOWN HOLE; the funnel
 *                      reports it as such instead of pretending a zero is a drop-off.
 */
export type MarkerCoverage = 'observed' | 'emitted' | 'unimplemented'

/** Who a step counts. `engagement_events` is keyed by profile; the anonymous vitals
 *  stream is keyed only by an ephemeral per-tab session id — the two can never be
 *  joined, which is exactly why the funnel reports the seam instead of hiding it. */
export type StepIdentity = 'actor' | 'session'

export interface JourneyStep {
  key: string
  /** Operator-facing label. Plain, no em dashes (docs/CONTENT-VOICE.md). */
  label: string
  stream: JourneyStream
  /** Satisfied by ANY of these markers (`event_type` / `kind`). Polymorphic steps —
   *  a claim can be a Circle or an event — legitimately name more than one. */
  markers: readonly string[]
  /** Optional SQL LIKE narrowing the row's path (`context->>'path'` on the semantic
   *  stream, `path` on the firehose). Used where the marker is generic but the SURFACE
   *  is the step, e.g. a page view of /circles. */
  pathLike?: string
  /** The step only counts if it lands within N days of the previous one (J4's return). */
  withinDays?: number
  coverage: MarkerCoverage
  /** Why this marker, or what is missing. Shown on the readout for a gap. */
  note?: string
}

export interface Journey {
  key: string
  /** Operator-facing name. */
  name: string
  /** The one question this funnel answers. */
  question: string
  steps: readonly JourneyStep[]
}

/** A step's counting identity is fully determined by its stream. */
export function stepIdentity(step: JourneyStep): StepIdentity {
  return step.stream === 'engagement' ? 'actor' : 'session'
}

// ── The registry ────────────────────────────────────────────────────────────────
// Every marker below was verified against the live ledger before it was written down.

export const JOURNEYS: readonly Journey[] = [
  {
    key: 'land_to_beta',
    name: 'Land to beta',
    question: 'Of the people who reach the site, how many end up inside it?',
    steps: [
      {
        key: 'landed',
        label: 'Loaded a page',
        stream: 'interaction',
        markers: ['web_vital'],
        coverage: 'observed',
        note:
          'The only anonymous marker in the ledger. /api/track and /api/observe both drop anonymous posts, so a visitor who has not signed in leaves no semantic row at all. Every sampled page load emits at least TTFB, which makes the vitals stream a real (if sideways) reach signal, keyed by the ephemeral per-tab session id.',
      },
      {
        key: 'reached_the_invitation',
        label: 'Reached the beta invitation',
        stream: 'interaction',
        markers: ['web_vital'],
        pathLike: '/beta%',
        coverage: 'observed',
      },
      {
        key: 'joined_the_waitlist',
        label: 'Joined the waitlist',
        stream: 'engagement',
        markers: ['waitlist.joined', 'application.submitted'],
        coverage: 'emitted',
        note:
          'Both emitters are live (the waitlist action and the application handoff). No rows yet, and the identity seam sits here: the steps above are session-keyed and cannot be linked to this profile-keyed step.',
      },
      {
        key: 'account_created',
        label: 'Created an account',
        stream: 'engagement',
        markers: ['account.created'],
        coverage: 'unimplemented',
        note:
          'GAP. `account.created` is registered in the taxonomy (lib/analytics/events.ts) but nothing emits it. Sign-up currently leaves no ledger row, so the step between joining the waitlist and finishing induction is invisible.',
      },
      {
        key: 'induction_completed',
        label: 'Finished induction',
        stream: 'engagement',
        markers: ['onboarding.induction_completed'],
        coverage: 'observed',
      },
    ],
  },
  {
    key: 'join_to_circle',
    name: 'Join to first Circle',
    question: 'Of the members who finish induction, how many find a Circle?',
    steps: [
      {
        key: 'induction_completed',
        label: 'Finished induction',
        stream: 'engagement',
        markers: ['onboarding.induction_completed'],
        coverage: 'observed',
      },
      {
        key: 'met_vera',
        label: 'Met Vera',
        stream: 'engagement',
        markers: ['onboarding.vera_opened'],
        coverage: 'emitted',
        note: 'Emitted at app/onboarding/vera/page.tsx. No rows yet.',
      },
      {
        key: 'browsed_circles',
        label: 'Browsed Circles',
        stream: 'engagement',
        markers: ['nav.page_view'],
        pathLike: '/circles%',
        coverage: 'observed',
      },
      {
        key: 'joined_a_circle',
        label: 'Joined a Circle',
        stream: 'engagement',
        markers: ['circle.joined', 'circle.started', 'circle.claimed'],
        coverage: 'observed',
        note:
          'Three ways in: joining an existing Circle, starting one, or claiming one. All three end the same way for this funnel.',
      },
    ],
  },
  {
    key: 'circle_to_rsvp',
    name: 'First Circle to first RSVP',
    question: 'Once a member has a Circle, do they show up to anything?',
    steps: [
      {
        key: 'joined_a_circle',
        label: 'Joined a Circle',
        stream: 'engagement',
        markers: ['circle.joined', 'circle.started', 'circle.claimed'],
        coverage: 'observed',
      },
      {
        key: 'browsed_events',
        label: 'Browsed events',
        stream: 'engagement',
        markers: ['nav.page_view'],
        pathLike: '/events%',
        coverage: 'observed',
      },
      {
        key: 'rsvped',
        label: 'RSVP’d to an event',
        stream: 'engagement',
        markers: ['event.rsvp'],
        coverage: 'unimplemented',
        note:
          'GAP, and the most expensive one. `event.rsvp` is registered in the taxonomy but nothing emits it: an RSVP writes an `event_rsvps` row and stops there. This funnel cannot close until the RSVP path calls track(). Until then the last step reads 0 and means "not measured", not "nobody went".',
      },
    ],
  },
  {
    key: 'practice_to_return',
    name: 'First practice to the return',
    question: 'Does a first logged practice turn into a second one inside a week?',
    steps: [
      {
        key: 'adopted',
        label: 'Adopted a practice',
        stream: 'engagement',
        markers: ['practice.adopted', 'practice.claimed'],
        coverage: 'observed',
      },
      {
        key: 'first_log',
        label: 'Logged a practice',
        stream: 'engagement',
        markers: ['practice.verified'],
        coverage: 'observed',
        note: 'The North Star event (ADR-024): a verified, real-world practice.',
      },
      {
        key: 'returned_within_7d',
        label: 'Logged again within 7 days',
        stream: 'engagement',
        markers: ['practice.verified'],
        withinDays: 7,
        coverage: 'observed',
        note:
          'The same marker as the step before it, gated on a second occurrence inside the window. That is the whole of retention as this product defines it.',
      },
    ],
  },
  {
    key: 'claim_to_published',
    name: 'Operator: claim to published',
    question: 'Does claiming a listing turn into something the public can see?',
    steps: [
      {
        key: 'claimed',
        label: 'Claimed a Circle or an event',
        stream: 'engagement',
        markers: ['circle.claimed', 'event.claimed'],
        coverage: 'observed',
        note: 'event.claimed has rows; circle.claimed is emitted but has none yet.',
      },
      {
        key: 'opened_manage',
        label: 'Opened the manage console',
        stream: 'engagement',
        markers: ['nav.page_view'],
        pathLike: '%/manage%',
        coverage: 'observed',
      },
      {
        key: 'published',
        label: 'Published something public',
        stream: 'engagement',
        markers: ['event.posted', 'entry_point.created'],
        coverage: 'observed',
        note:
          'PARTIAL. Posting an event and creating an entry point both land. Publishing a Space profile or a page does NOT emit anything, so this step under-counts the operators who publish a profile and nothing else.',
      },
    ],
  },
] as const

const BY_KEY = new Map(JOURNEYS.map((j) => [j.key, j]))

export function getJourney(key: string): Journey | undefined {
  return BY_KEY.get(key)
}

export const JOURNEY_KEYS: readonly string[] = JOURNEYS.map((j) => j.key)

/** Every step whose marker nothing emits. The honest bill for Lift 1a. */
export function journeyGaps(): Array<{ journey: string; step: JourneyStep }> {
  return JOURNEYS.flatMap((j) =>
    j.steps.filter((s) => s.coverage === 'unimplemented').map((step) => ({ journey: j.key, step })),
  )
}

/**
 * Two adjacent steps are LINKED when they count the same kind of subject. An
 * anonymous session id and a profile id share no join key, so a conversion rate across
 * that seam would be a fabrication — the readout draws a break instead.
 */
export function stepsAreLinked(prev: JourneyStep, next: JourneyStep): boolean {
  return stepIdentity(prev) === stepIdentity(next)
}

/** The step spec handed to the `journey_funnel` RPC. SQL holds no copy of the registry;
 *  it receives this and walks it. Keys are the SQL side's contract — keep in sync with
 *  supabase/migrations/20270207000000_insights_journey_and_vitals_rpcs.sql. */
export interface FunnelStepSpec {
  key: string
  stream: JourneyStream
  markers: readonly string[]
  pathLike: string | null
  withinDays: number | null
}

export function toFunnelSpec(journey: Journey): FunnelStepSpec[] {
  return journey.steps.map((s) => ({
    key: s.key,
    stream: s.stream,
    markers: s.markers,
    pathLike: s.pathLike ?? null,
    withinDays: s.withinDays ?? null,
  }))
}

// ── The funnel read-model (pure) ────────────────────────────────────────────────

/** One row as the RPC returns it. */
export interface JourneyFunnelRow {
  stepKey: string
  subjects: number
}

export interface JourneyFunnelStep {
  key: string
  label: string
  identity: StepIdentity
  coverage: MarkerCoverage
  note?: string
  subjects: number
  /** % of the previous step that reached this one. Null on the first step, across an
   *  identity seam, or when the step has no emitter to count. */
  conversionPct: number | null
  /** % of the FIRST step of this run of linked steps. Null in the same cases. */
  ofStartPct: number | null
  /** False when the step above counts a different kind of subject. */
  linkedToPrevious: boolean
}

export interface JourneyFunnel {
  key: string
  name: string
  question: string
  windowDays: number
  steps: JourneyFunnelStep[]
  /** Steps in this funnel with no emitter. */
  gaps: string[]
}

/** Pure: attach conversion to an ordered step list. Unit-tested. */
export function computeJourneyFunnel(
  journey: Journey,
  rows: readonly JourneyFunnelRow[],
  windowDays: number,
): JourneyFunnel {
  const byKey = new Map(rows.map((r) => [r.stepKey, r.subjects]))
  let runStart: number | null = null

  const steps = journey.steps.map((s, i) => {
    const prev = i === 0 ? null : journey.steps[i - 1]
    const linked = prev !== null && stepsAreLinked(prev, s)
    const subjects = byKey.get(s.key) ?? 0
    if (!linked) runStart = subjects

    const prevSubjects = prev ? (byKey.get(prev.key) ?? 0) : 0
    const measured = s.coverage !== 'unimplemented'
    const conversionPct =
      linked && measured && prevSubjects > 0 ? Math.round((subjects / prevSubjects) * 100) : null
    const ofStartPct =
      linked && measured && runStart && runStart > 0 ? Math.round((subjects / runStart) * 100) : null

    return {
      key: s.key,
      label: s.label,
      identity: stepIdentity(s),
      coverage: s.coverage,
      note: s.note,
      subjects,
      conversionPct,
      ofStartPct,
      linkedToPrevious: linked,
    }
  })

  return {
    key: journey.key,
    name: journey.name,
    question: journey.question,
    windowDays,
    steps,
    gaps: journey.steps.filter((s) => s.coverage === 'unimplemented').map((s) => s.key),
  }
}

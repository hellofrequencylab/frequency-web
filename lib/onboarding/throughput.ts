// Onboarding throughput: who is stuck BEHIND the admission gate right now? (LIVE-311)
//
// app/(main)/layout.tsx redirects any member `hasEffectivelyOnboarded()` returns false for into
// /join on every request. ADR-1324 found nine accounts inside that loop for up to eleven weeks,
// and the only instrument was a member texting. Nothing measured whether people got THROUGH the
// gate, only whether it was closed. This module is the reading: a pure classifier over one row
// per account, so the cron that runs it nightly (app/api/cron/onboarding-throughput) can be
// tested against fixtures and the rule can be read in one place.
//
// The three states, and why each boundary sits where it does:
//   stuck      not onboarded, older than MIN_AGE_DAYS, signed in inside ACTIVE_WINDOW_DAYS. A
//              person who keeps coming back and keeps being thrown out. Non-zero is a lockout.
//   fresh      not onboarded but younger than MIN_AGE_DAYS. Still inside a normal first sitting;
//              counting these would page on every signup that finishes tomorrow.
//   dormant    not onboarded, old enough, but no sign-in inside the window. Gave up or never
//              came back; a recovery problem (LIVE-170), not a lockout.
//   completed  onboarded by the SAME predicate the gate uses. The runner feeds
//              `hasEffectivelyOnboarded`, never the raw flag alone, so a seeded member the gate
//              already admits is never reported as stuck here.
//
// Pure and dependency-light on purpose: no client, no clock of its own. The caller passes `now`.

export const MIN_AGE_DAYS = 3
export const ACTIVE_WINDOW_DAYS = 30

const DAY_MS = 86_400_000

export interface OnboardingAccountRow {
  /** profiles.id. Reported; never an email or auth id. */
  id: string
  /** profiles.created_at, ISO. */
  created_at: string | null
  /** The gate's own verdict for this row (hasEffectivelyOnboarded over meta + economy). */
  onboarding_completed: boolean
  /** auth.users.last_sign_in_at, ISO; null when the account has never signed in. */
  last_sign_in_at: string | null
}

export type OnboardingAccountState = 'stuck' | 'fresh' | 'dormant' | 'completed'

export interface ThroughputOptions {
  minAgeDays?: number
  activeWindowDays?: number
}

function parseMs(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/** Classify one account against the gate at `now`. Pure. */
export function classifyOnboardingAccount(
  row: OnboardingAccountRow,
  now: Date,
  opts: ThroughputOptions = {},
): OnboardingAccountState {
  if (row.onboarding_completed) return 'completed'
  const minAgeMs = (opts.minAgeDays ?? MIN_AGE_DAYS) * DAY_MS
  const windowMs = (opts.activeWindowDays ?? ACTIVE_WINDOW_DAYS) * DAY_MS
  const nowMs = now.getTime()

  // An unparseable or missing created_at is treated as OLD, not fresh: the fresh state is the
  // one that suppresses the reading, so it is only granted on a date that proves it.
  const createdMs = parseMs(row.created_at)
  if (createdMs !== null && nowMs - createdMs < minAgeMs) return 'fresh'

  const signedInMs = parseMs(row.last_sign_in_at)
  if (signedInMs === null || nowMs - signedInMs > windowMs) return 'dormant'

  return 'stuck'
}

export interface ThroughputReading {
  stuck: string[]
  counts: Record<OnboardingAccountState, number>
  scanned: number
}

/** The reading over every row: the stuck profile ids (oldest account first) plus the counts. */
export function readOnboardingThroughput(
  rows: readonly OnboardingAccountRow[],
  now: Date,
  opts: ThroughputOptions = {},
): ThroughputReading {
  const counts: Record<OnboardingAccountState, number> = { stuck: 0, fresh: 0, dormant: 0, completed: 0 }
  const stuckRows: OnboardingAccountRow[] = []
  for (const row of rows) {
    const state = classifyOnboardingAccount(row, now, opts)
    counts[state] += 1
    if (state === 'stuck') stuckRows.push(row)
  }
  stuckRows.sort((a, b) => (parseMs(a.created_at) ?? 0) - (parseMs(b.created_at) ?? 0))
  return { stuck: stuckRows.map((r) => r.id), counts, scanned: rows.length }
}

// THE TIMED BETA OFFER (try-first funnel). One clock per person, kept on profiles.meta.operator_offer,
// started the first time the person is shown the offer and never restarted. PURE: callers pass the clock.
//
// Honesty rules, enforced in code rather than in copy:
//   - the end instant is fixed at start (start + OFFER_HOURS, capped at the Beta end), so a refresh,
//     a new Space or a cleared cookie cannot move it;
//   - once it has passed, checkout stops charging the Beta price for this person
//     (lib/billing/space-plan-checkout.ts), so the deadline is real.

export const OFFER_HOURS = 72

const HOUR_MS = 3_600_000

export type OperatorOffer =
  | { status: 'none' }
  | { status: 'live'; startedAtMs: number; endsAtMs: number }
  | { status: 'expired'; startedAtMs: number; endsAtMs: number }

/** The end instant for an offer started at `startedAtMs`: 72 hours, never past the Beta end. */
export function offerEndsAtMs(startedAtMs: number, betaEndsAtMs: number | null): number {
  const natural = startedAtMs + OFFER_HOURS * HOUR_MS
  return betaEndsAtMs !== null && betaEndsAtMs < natural ? betaEndsAtMs : natural
}

/** Read the stored offer off profiles.meta. A missing or malformed record is `none`. */
export function readOperatorOffer(meta: unknown, now: number): OperatorOffer {
  const raw = (meta as { operator_offer?: { startedAt?: unknown; endsAt?: unknown } } | null | undefined)?.operator_offer
  const startedAtMs = typeof raw?.startedAt === 'string' ? Date.parse(raw.startedAt) : NaN
  const endsAtMs = typeof raw?.endsAt === 'string' ? Date.parse(raw.endsAt) : NaN
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endsAtMs)) return { status: 'none' }
  return now < endsAtMs ? { status: 'live', startedAtMs, endsAtMs } : { status: 'expired', startedAtMs, endsAtMs }
}

/** "2d 04h 12m" / "3h 05m 09s": the remaining time in words a person can read at a glance. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86_400)
  const h = Math.floor((total % 86_400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`
  return `${h}h ${pad(m)}m ${pad(s)}s`
}

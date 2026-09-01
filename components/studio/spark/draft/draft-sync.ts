// ─────────────────────────────────────────────────────────────────────────────
// RECONCILING TWO COPIES OF ONE DRAFT (ADR-1001 in docs/DECISIONS.md).
//
// PURE. No React, no DOM, no `window`, no Supabase. The whole decision about whose typing wins
// lives in one function that takes two plain objects and a clock, because this is the single
// place where the feature can do real harm: a silent clobber is how someone loses an hour of
// writing, and that is the worst outcome this work can produce.
//
// THE RULE: newest wins, but never silently. Where the two copies say the same thing there is
// nothing to decide. Where they differ and the SERVER copy is newer, the author is asked, in
// plain words, and picks. Nothing is overwritten on their behalf.
// ─────────────────────────────────────────────────────────────────────────────

import { DRAFT_TTL_MS, isExpired, type SparkDraft } from './draft-store'

/** The server's copy of a draft, in the same shape the local one uses. */
export interface ServerDraft {
  scope: string
  step: number
  values: Record<string, string>
  /** Epoch ms of the server's `updated_at`. */
  savedAt: number
}

/**
 * Two clocks are being compared: a device clock (local `savedAt`) and the database clock
 * (`updated_at`). They are not the same clock and never will be, so a difference smaller than
 * this is not evidence that either copy is newer. A minute is far larger than the sync round
 * trip and far smaller than the gap between two real writing sessions.
 */
export const CLOCK_SKEW_MS = 60_000

export type DraftReconciliation =
  /** Nothing anywhere. The Spark opens clean. */
  | { outcome: 'none' }
  /** Only this device has a draft, or its copy is the one to trust. Offer it the usual way. */
  | { outcome: 'local'; draft: SparkDraft }
  /** Only the server has a draft. Nothing on this device can be lost by taking it. */
  | { outcome: 'server'; draft: ServerDraft }
  /** Both, they differ, and the server's is newer. ASK. Never resolve this one in code. */
  | { outcome: 'conflict'; local: SparkDraft; server: ServerDraft }

/** Same keys, same strings. Order is irrelevant; a draft is a bag of answers, not a list. */
export function sameAnswers(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k])
}

const hasContent = (values: Record<string, string> | null | undefined): boolean =>
  !!values && Object.keys(values).length > 0

/**
 * Decide what to do with the two copies. PURE, and the ONLY place that decision is made.
 *
 * Order of the checks, and why each one is where it is:
 *
 *   1. An EXPIRED copy is not a copy. The server read filters on the window too, so this is belt
 *      and braces for a row a late sweep left behind.
 *   2. Empty copies drop out, so an author who cleared every field is never offered emptiness.
 *   3. IDENTICAL copies are not a conflict. This is the ordinary case: the device wrote, the sync
 *      pushed, and the two agree. Asking here would train people to click through the card that
 *      matters.
 *   4. The server copy only wins when it is newer by more than the clock skew. Anything closer
 *      than that is a tie, and a tie goes to the device the author is sitting at.
 *   5. Newer and different means ASK. That is the whole point.
 */
export function reconcileDrafts(
  local: SparkDraft | null,
  server: ServerDraft | null,
  now: number = Date.now(),
  ttlMs: number = DRAFT_TTL_MS,
): DraftReconciliation {
  const liveLocal = local && !isExpired(local, now, ttlMs) && hasContent(local.values) ? local : null
  const liveServer =
    server && now - server.savedAt <= ttlMs && server.savedAt <= now + ttlMs && hasContent(server.values)
      ? server
      : null

  if (!liveLocal && !liveServer) return { outcome: 'none' }
  if (!liveServer) return { outcome: 'local', draft: liveLocal as SparkDraft }
  if (!liveLocal) return { outcome: 'server', draft: liveServer }

  if (sameAnswers(liveLocal.values, liveServer.values)) return { outcome: 'local', draft: liveLocal }
  if (liveServer.savedAt > liveLocal.savedAt + CLOCK_SKEW_MS) {
    return { outcome: 'conflict', local: liveLocal, server: liveServer }
  }
  return { outcome: 'local', draft: liveLocal }
}

// ── When a push is allowed ───────────────────────────────────────────────────────────────────
//
// The other half of the harm surface, and pure for the same reason. Three rules, one state.

/** How often the staged copy is refreshed while someone is typing. Slower than the local write on
 *  purpose: localStorage is free, a round trip is not, and nobody needs their phone to know what
 *  their laptop typed half a second ago. */
export const SERVER_SYNC_MS = 2_000

/** After a failed push, wait this long before trying again. One bad request must not become a
 *  request per pause for the rest of the session. */
export const SERVER_BACKOFF_MS = 30_000

export interface SyncGate {
  /**
   * THE CLOBBER GATE. False until the server has ANSWERED the opening read. A Spark that could not
   * reach the server therefore never pushes, which means it can never overwrite a newer copy it
   * failed to read. Local-only is the correct degraded state; this is what makes it safe rather
   * than merely quiet.
   */
  ready: boolean
  /** The local copy has moved since the last confirmed push. */
  dirty: boolean
  /** Epoch ms the next push is allowed. Carries both the cadence and the failure backoff. */
  nextPushAt: number
}

export const IDLE_GATE: SyncGate = { ready: false, dirty: false, nextPushAt: 0 }

/** Whether a push may go out right now. Nothing else in the hook decides this. */
export function mayPush(gate: SyncGate, now: number): boolean {
  return gate.ready && gate.dirty && now >= gate.nextPushAt
}

/** The gate the moment a push is sent: nothing outstanding, and the cadence starts again. */
export function afterPush(gate: SyncGate, now: number): SyncGate {
  return { ...gate, dirty: false, nextPushAt: now + SERVER_SYNC_MS }
}

/**
 * The gate after a push failed. It goes back to DIRTY, which is the whole point: the typing is
 * still unsent, not lost, and it will go out on the next opportunity. Nothing here touches the
 * local copy, which is what makes a network error a non-event for the author.
 */
export function afterFailure(gate: SyncGate, now: number): SyncGate {
  return { ...gate, dirty: true, nextPushAt: now + SERVER_BACKOFF_MS }
}

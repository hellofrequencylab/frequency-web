// Entity-profile analytics — the first telemetry on a Space profile (/spaces/<slug>).
//
// Operators need to see how a profile PERFORMS (views, CTA clicks). Rather than stand up a
// new table, this rides the EXISTING semantic engagement ledger (lib/engagement/events.ts →
// `engagement_events`): the same SOURCE → LEDGER → RULES spine every other named business
// event uses (practice.verified, circle.joined, event.posted, …). We add two named event
// types in that taxonomy and tag each with the `space_id` so a later operator read can slice
// "how did THIS profile perform" the same way the engagement dashboard already slices props
// (engagement_prop_counts reads from the row's `context` jsonb — lib/analytics/dashboard.ts).
//
// WHY `context.space_id` and NOT a new column: `engagement_events.context` is the table's
// purpose-built per-source jsonb detail bag (node id, peer, location, …). A Space id drops in
// cleanly there and is immediately queryable via the existing prop-count RPC, so this needs
// NO migration — the codebase rule for "the jsonb bag fits" (mirrors node_capture stashing
// `nodeId` in context). The dotted event-type names join the existing `space.*` / `*.verb`
// namespace convention.
//
// FAIL-SAFE BY CONTRACT: every function here swallows its own errors and resolves void. A
// telemetry write must NEVER throw into, or block, a render. Callers fire-and-forget (`void`).
// Server-only: routes through recordEngagementEvent, which uses the service-role admin client.

import { cache } from 'react'
import { recordEngagementEvent } from '@/lib/engagement/events'

/** The ledger event types this surface emits, in the existing dotted `space.*` taxonomy. */
const PROFILE_VIEW = 'space.profile_view'
const CTA_CLICK = 'space.cta_click'

/**
 * Record one profile-VIEW of a Space, deduped to once per (space, viewer, day).
 *
 * Fire-and-forget from the profile layout as a non-blocking side effect (`void recordSpaceProfileView(...)`):
 * it never throws and never awaits into the render path. The daily idempotency key keeps a
 * single member reloading a profile (or its tabs) from inflating the count to one bucket per
 * day; `viewerProfileId` is the actor when signed in, else null (anonymous views still count).
 */
export async function recordSpaceProfileView(
  spaceId: string,
  viewerProfileId: string | null = null,
): Promise<void> {
  if (!spaceId) return
  try {
    // One view bucket per (space, viewer, UTC day). An anonymous viewer collapses to a single
    // daily bucket per space — coarse but honest, and never forges a per-member count.
    const day = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
    await recordEngagementEvent({
      idempotencyKey: `space_view:${spaceId}:${viewerProfileId ?? 'anon'}:${day}`,
      source: 'web',
      eventType: PROFILE_VIEW,
      actorProfileId: viewerProfileId,
      context: { spaceId },
    })
  } catch (err) {
    // Telemetry is best-effort: a ledger hiccup must not surface on the profile.
    console.error('[spaces/analytics] recordSpaceProfileView failed:', err)
  }
}

/**
 * Record one primary-CTA click on a Space profile, tagged with `space_id`.
 *
 * Provided as the trackable seam for when the CTA routes through an action/route handler that
 * can call it (e.g. a booking action). It is NOT wired into the current plain `<Link>` CTA,
 * which is bare navigation with no server seam to hang a write on (instrumenting it would mean
 * a client wrapper + endpoint — out of scope). Fail-safe and fire-and-forget like the view.
 */
export async function recordSpaceCtaClick(
  spaceId: string,
  viewerProfileId: string | null = null,
): Promise<void> {
  if (!spaceId) return
  try {
    // CTA clicks are intent signals, not once-per-day milestones, so each click is its own row:
    // a per-request random key makes every recorded click distinct (no idempotency collapse).
    const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    await recordEngagementEvent({
      idempotencyKey: `space_cta:${spaceId}:${viewerProfileId ?? 'anon'}:${nonce}`,
      source: 'web',
      eventType: CTA_CLICK,
      actorProfileId: viewerProfileId,
      context: { spaceId },
    })
  } catch (err) {
    console.error('[spaces/analytics] recordSpaceCtaClick failed:', err)
  }
}

/**
 * Fire the profile-VIEW exactly once for THIS request, then return immediately.
 *
 * The layout calls `void trackSpaceProfileViewOnce(...)` as a non-blocking side effect. Two
 * dedup layers stack: the Next.js layout itself does not re-render on tab navigation within a
 * profile (so switching tabs never re-fires from here), and `React.cache` collapses any repeat
 * call in the SAME request to one — so even a retry or a second reader can't double-fire. The
 * cached function returns void synchronously-fast (it kicks off the write but does not await it),
 * so the render is never blocked on the ledger round-trip. Keyed by (spaceId, viewerProfileId)
 * so distinct viewers in one request would each count (the request is per-viewer in practice).
 */
export const trackSpaceProfileViewOnce = cache((spaceId: string, viewerProfileId: string | null): void => {
  // Fire-and-forget: kick the recorder off without awaiting. The recorder is itself fail-safe.
  void recordSpaceProfileView(spaceId, viewerProfileId)
})

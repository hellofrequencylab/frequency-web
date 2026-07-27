import { createAdminClient } from '@/lib/supabase/admin'
import { routeNotification } from '@/lib/notifications/router'
import { listActiveSpaceMemberIds } from '@/lib/spaces/resonance-roster'

// Space Dispatches data layer (ADR-858, the Space message center).
//
// A Space owner announces to their members on the SAME Dispatch rail the community
// tiers ride — one `dispatches` row scoped to the Space (audience_scope 'space',
// 20270106000000) — NOT a new broadcaster. Push fan-out mirrors the Event Dispatch
// half (lib/events/dispatch.ts `fanOutEventPush`): the caller resolves WHO (the
// Space's active members + owner, minus the author), the notification ROUTER
// (ADR-627) owns WHETHER + the job shape, so the member's push preference applies
// per recipient. Authorize the caller as space-manage before calling (writes run
// on the admin client; RLS keeps dispatches service-role-write only).

export interface ComposeSpaceDispatchArgs {
  spaceId: string
  /** The space owner/manager composing (must be pre-authorized). */
  authorId: string
  title?: string | null
  body: string
  /** Pre-resolved display name; fetched from `spaces` when omitted (drives the default title). */
  spaceName?: string | null
  /** Where the push notification should land (the Space page). */
  spaceUrl?: string | null
}

export interface ComposeSpaceDispatchResult {
  /** The dispatches row id, null when nothing was published (empty body / failed insert). */
  dispatchId: string | null
  /** How many push jobs were enqueued for the fan-out. */
  enqueued: number
}

/**
 * Publish one Space Dispatch + fan out push to the Space's members. Best-effort on
 * fan-out: a failed enqueue never undoes the published Dispatch.
 */
export async function composeSpaceDispatch(
  args: ComposeSpaceDispatchArgs,
): Promise<ComposeSpaceDispatchResult> {
  const admin = createAdminClient()
  const title = args.title?.trim() || null
  const body = args.body.trim()

  const result: ComposeSpaceDispatchResult = { dispatchId: null, enqueued: 0 }
  if (!body) return result

  // Resolve the Space's name when the caller didn't pass one: it feeds the default
  // title, and a Dispatch titled "From <space>" must never render a raw null.
  let spaceName = args.spaceName?.trim() || null
  if (!spaceName) {
    const { data: space } = await admin
      .from('spaces')
      .select('name')
      .eq('id', args.spaceId)
      .maybeSingle()
    spaceName = space?.name?.trim() || null
  }

  // 1. Publish the Dispatch on the existing rail, scoped to the Space
  //    (audience_scope 'space' requires the audience_id — 20270106000000).
  const { data: disp } = await admin
    .from('dispatches')
    .insert({
      author_id: args.authorId,
      title: title ?? `From ${spaceName ?? 'your Space'}`,
      body,
      audience_scope: 'space',
      audience_id: args.spaceId,
      dispatch_type: 'post',
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()
  result.dispatchId = disp?.id ?? null
  if (!result.dispatchId) return result

  // 2. Fan out push to the Space's members. Fail-soft: push never fails the Dispatch.
  try {
    result.enqueued = await fanOutSpaceDispatchPush(args.spaceId, args.authorId, {
      title: title ?? `From ${spaceName ?? 'your Space'}`,
      body,
      url: args.spaceUrl ?? '/spaces',
    })
  } catch {
    // the Dispatch is already published; a broken fan-out just reports 0 enqueued
  }

  return result
}

/**
 * Enqueue a push job per Space member who should hear about this Dispatch.
 *
 * PUSH audience: the Space's ACTIVE members + its owner (listActiveSpaceMemberIds,
 * the same set every Space roster surface reads), minus the author — nobody is
 * pushed their own announcement. This resolves WHO; the router (ADR-627) owns
 * WHETHER: routeNotification('event.dispatch', …) maps to category 'dispatches',
 * so the member's push preference gates each job before it is enqueued. Returns
 * the number enqueued. Best-effort — a single bad recipient never aborts the batch.
 */
async function fanOutSpaceDispatchPush(
  spaceId: string,
  authorId: string,
  payload: { title: string; body: string; url: string },
): Promise<number> {
  const recipients = (await listActiveSpaceMemberIds(spaceId)).filter((id) => id !== authorId)

  let enqueued = 0
  for (const profileId of recipients) {
    try {
      const result = await routeNotification(
        'event.dispatch',
        { profileId },
        { title: payload.title, body: payload.body, url: payload.url },
      )
      enqueued += result.enqueuedCount
    } catch {
      // skip a bad recipient; the rest of the fan-out still goes out
    }
  }
  return enqueued
}

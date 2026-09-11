'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { composeSpaceDispatch } from '@/lib/spaces/dispatch'
import { ok, fail, type ActionResult } from '@/lib/action-result'

// THE POST BOX's Dispatch send, space-scoped (LIVE-295, owner ruling 2026-09-10).
//
// The affordance already existed: components/feed/capture-box.tsx has carried a Dispatch capture
// mode since ADR-155/156, filtered in by `canAnnounce`. What it never had was a SPACE scope. The
// only producer of `canAnnounce` for that box reads the COMMUNITY role (app/(main)/feed/page.tsx),
// and the community Dispatch mode writes a pinned `posts` row, not a Dispatch at all. This action
// is the space-scoped half: the box mounted for a Space the caller can manage sends through here,
// and `composeSpaceDispatch` publishes ONE `dispatches` row at audience_scope 'space' with
// audience_id = that Space. That is the exact shape lib/dispatches.ts and lib/digest.ts already
// read, so the rail and the weekly digest light up with no reader change.
//
// 🔴 THE SCOPE COMES FROM THE MOUNT, AND A MOUNT THAT CANNOT RESOLVE ITS SPACE IS REFUSED.
// lib/events/dispatch.ts writes audience_scope 'global', which is every member of the platform. A
// space Dispatch that landed as global would be a mass-notification incident, not a bug. So this
// action has no default target and no fallback: the Space is re-derived from the slug server-side,
// and every miss (signed out, no slug, Space not visible, id mismatch, not a manager) RETURNS AN
// ERROR. There is no branch here that reaches a writer without a resolved Space id.
//
// AUTHORIZATION: a server action is a public HTTP endpoint, so the caller-supplied `spaceId` is
// NEVER trusted. The slug is resolved through `getVisibleSpaceBySlug` under the caller's own
// visibility, the caller is gated on `resolveSpaceManageAccess(...).canManage` (a staff janitor's
// read-only preview is NOT a manager and cannot send), and the resolved id must MATCH the id the
// mount claimed. A mismatch means the request did not come from the surface that rendered, so it is
// refused rather than reconciled.
//
// Copy: plain, no em dashes (CONTENT-VOICE §10). "Dispatch" is the member-facing noun (NAMING.md).

/** The most a single Dispatch body may carry. Mirrors the Message center's own body ceiling. */
const MAX_BODY = 5000
/** The most a Dispatch title may carry (`dispatches.title` is a plain text heading). */
const MAX_TITLE = 200

export interface SendSpaceDispatchInput {
  /** The Space slug the post box was mounted for. The Space is re-derived from THIS, server-side. */
  slug: string
  /** The Space id the mount rendered. An integrity check only, never the source of the target. */
  spaceId: string
  /** The composed announcement. */
  body: string
  /** Optional heading. Omitted or blank falls back to "From <space>" inside the writer. */
  title?: string | null
}

/**
 * Publish one Space Dispatch from the post box. Space-manage gated, fail-closed, and bound to the
 * Space the mount resolved. Returns the published row's id so the caller can confirm honestly.
 */
export async function sendSpaceDispatch(
  input: SendSpaceDispatchInput,
): Promise<ActionResult<{ dispatchId: string }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to send a Dispatch.')

  const slug = input.slug?.trim()
  const claimedId = input.spaceId?.trim()
  // REFUSE, never fall back. A mount that did not carry its Space cannot be resolved into one here,
  // and guessing would be the global-blast path this action exists to make impossible.
  if (!slug || !claimedId) return fail('This Dispatch has no space to send to.')

  const body = input.body?.trim()
  if (!body) return fail('Write something to send.')
  if (body.length > MAX_BODY) return fail('That Dispatch is too long. Trim it and send again.')

  const rawTitle = input.title?.trim() || null
  if (rawTitle && rawTitle.length > MAX_TITLE) return fail('That title is too long.')

  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return fail('We could not find that space.')
  // The mount's id and the resolved id must be the same Space. They differ only when the request did
  // not come from the surface that rendered, so it is refused.
  if (space.id !== claimedId) return fail('That Dispatch does not match this space.')

  const { canManage } = await resolveSpaceManageAccess(space, caller.id, caller.webRole)
  if (!canManage) return fail('Only someone who runs this space can send a Dispatch.')

  const spaceName = space.brandName ?? space.name ?? null

  const res = await composeSpaceDispatch({
    spaceId: space.id,
    authorId: caller.id,
    title: rawTitle,
    body,
    spaceName,
    spaceUrl: `/spaces/${space.slug}`,
  })
  if (!res.dispatchId) return fail('Could not send that Dispatch. Try again.')

  // The Dispatch rail and the Space page both read the new row.
  revalidatePath(`/spaces/${space.slug}`)
  revalidatePath('/nearby')

  return ok({ dispatchId: res.dispatchId })
}

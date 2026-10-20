'use server'

// BADGE REQUEST actions (LIVE-1180). requestBadge is the member's "Get a scannable badge" button on a
// Space's page; the other two serve the CyberUnicorn console in the admin menu (staff only, gated in
// ./badges.ts). The card itself is still minted and written by the console's actions in ./actions.ts.

import { revalidatePath } from 'next/cache'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { cancelBadgeRequest, fileBadgeRequest, findSpaceForConsole } from './badges'
import { scannerDevicesEnabled } from './store'

/** A member asks this Space for a scannable badge. */
export async function requestBadge(spaceId: string): Promise<ActionResult> {
  if (!scannerDevicesEnabled()) return fail('Badges are not open yet.')
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to get a badge.')
  const space = typeof spaceId === 'string' ? await getSpaceById(spaceId) : null
  if (!space) return fail('That Space is not here anymore.')
  if (!(await fileBadgeRequest(space.id, profileId))) return fail('Could not send that. Try again.')
  revalidatePath(`/spaces/${space.slug}`)
  revalidatePath('/admin/cyberunicorn')
  return ok()
}

/** Staff clear a request without writing a card. */
export async function dismissBadgeRequest(requestId: string): Promise<ActionResult> {
  if (typeof requestId !== 'string' || !(await cancelBadgeRequest(requestId))) return fail('Could not clear that request.')
  revalidatePath('/admin/cyberunicorn')
  return ok()
}

/** Staff type a Space's link name into the console. */
export async function lookupConsoleSpace(rawSlug: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  const slug =
    typeof rawSlug === 'string'
      ? rawSlug.trim().replace(/^https?:\/\/[^/]+/, '').replace(/^\/?spaces\//, '').replace(/^\//, '').split(/[/?#]/)[0].toLowerCase()
      : ''
  if (!slug) return fail('Type the Space’s link name, like the-group.')
  const space = await findSpaceForConsole(slug)
  return space ? ok(space) : fail(`No Space at /spaces/${slug}.`)
}

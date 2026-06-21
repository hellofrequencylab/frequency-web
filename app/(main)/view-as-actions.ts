'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getCallerProfile, getRealCallerRole } from '@/lib/auth'
import {
  VIEW_AS_COOKIE,
  canViewAs,
  serializeViewAsTarget,
  type ViewAsTarget,
} from '@/lib/view-as'
import { ROLE_HIERARCHY, isJanitor, roleRank, type CommunityRole } from '@/lib/core/roles'
import { getSpaceById } from '@/lib/spaces/store'

// "View as a role under you" — Host and above. Sets (or clears) the view-as cookie.
// The effective-role resolution in lib/view-as.ts only honours a target ranked BELOW
// the caller's real role; we re-check here too (defence in depth) so the cookie can
// only ever hold a valid downgrade.
export async function setViewAsRole(role: CommunityRole | 'visitor' | null): Promise<void> {
  const realRole = await getRealCallerRole()
  if (!realRole || !canViewAs(realRole)) return

  const jar = await cookies()
  // A valid target is 'visitor' (always a downgrade for a steward) or a ladder role
  // ranked STRICTLY below the caller. Anything else — incl. self or a higher role —
  // clears the override (back to your own view).
  const isValidTarget =
    role === 'visitor' ||
    (!!role && ROLE_HIERARCHY.includes(role) && roleRank(role) < roleRank(realRole))
  if (!isValidTarget) {
    jar.delete(VIEW_AS_COOKIE)
  } else {
    jar.set(VIEW_AS_COOKIE, role as string, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // Auto-expires so a steward is never silently stuck previewing.
      maxAge: 60 * 60 * 8,
    })
  }

  // Role drives the whole authenticated shell + capabilities, so refresh it all.
  revalidatePath('/', 'layout')
}

const ENTITY_PREVIEW_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  // Same 8-hour auto-expiry as the ladder preview, so a staffer is never silently stuck.
  maxAge: 60 * 60 * 8,
}

/** What the Space-preview action tells the client to do next. `href` is set when the Space resolved
 *  and the staffer may preview it (navigate there); otherwise `href` is null and `note` carries the
 *  on-voice line the caller shows instead of erroring. */
export interface SpacePreviewResult {
  href: string | null
  note?: string
}

/**
 * "View as <this Space>" — preview ONE specific Space's owner experience. STAFF-ONLY: gated on the
 * Executive Admin axis (web_role janitor), the exact viewer `resolveSpaceManageAccess` grants a
 * read-only `staffViewing` preview on the owner surface — so the action's gate and the surface's
 * gate are one and the same. Resolves the Space by id; a missing Space, the root Space (no owner
 * surface), or a non-janitor caller all return `{ href: null }` and never set the cookie.
 *
 * DOWNGRADE-SAFE: the cookie names the Space, not a role. `applyViewAs` returns the real community
 * role UNCHANGED for an entity target (no downgrade, and crucially no escalation), and the owner
 * surface keeps gating every WRITE on `canEditProfile` independently, so the staffer sees exactly
 * what that Space sees but can never write through it. The preview IS the routing into that Space's
 * owner surface; it confers no new authority anywhere.
 */
export async function previewAsSpace(spaceId: string): Promise<SpacePreviewResult> {
  const caller = await getCallerProfile()
  // STAFF gate: only an Executive Admin (janitor) may preview a Space they do not own — the same
  // axis `resolveSpaceManageAccess` reads to grant the read-only owner-surface preview. A
  // non-janitor (incl. a community steward who can use the ladder view-as) gets nothing here.
  if (!caller || !isJanitor(caller.webRole)) return { href: null }

  const id = (spaceId ?? '').trim()
  if (!id) return { href: null }

  // Resolve the Space the staffer asked to preview. A missing Space, or the root Space (which serves
  // the app itself and has no /spaces/<slug> owner surface), is not previewable.
  const space = await getSpaceById(id)
  if (!space || space.type === 'root') {
    return {
      href: null,
      note: 'That space is no longer available to preview.',
    }
  }

  const jar = await cookies()
  const target: ViewAsTarget = { kind: 'entity', spaceId: space.id }
  jar.set(VIEW_AS_COOKIE, serializeViewAsTarget(target), ENTITY_PREVIEW_COOKIE_OPTS)
  // The preview sets the staff-strip cookie + (potentially) chrome, so refresh the shell.
  revalidatePath('/', 'layout')

  // Route into THIS Space's owner experience. The settings hub renders for a janitor as a read-only
  // staff preview (resolveSpaceManageAccess.staffViewing), so the staffer lands exactly where the
  // owner works and sees precisely what that Space sees.
  return { href: `/spaces/${space.slug}/settings` }
}

/** Clear any Space preview (back to the staffer's own view). Mirrors selecting your real role on
 *  the ladder. Idempotent: deleting the cookie when none is set is a no-op. */
export async function exitSpacePreview(): Promise<void> {
  const realRole = await getRealCallerRole()
  if (!realRole || !canViewAs(realRole)) return
  const jar = await cookies()
  jar.delete(VIEW_AS_COOKIE)
  revalidatePath('/', 'layout')
}

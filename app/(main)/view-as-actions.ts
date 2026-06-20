'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getRealCallerRole } from '@/lib/auth'
import {
  VIEW_AS_COOKIE,
  canViewAs,
  serializeViewAsTarget,
  type ViewAsTarget,
} from '@/lib/view-as'
import { ROLE_HIERARCHY, roleRank, type CommunityRole } from '@/lib/core/roles'
import { isPreviewableEntityRole, representativeSpaceOfType } from '@/lib/spaces/representative'
import type { SpaceType } from '@/lib/spaces/types'

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
  // Same 8-hour auto-expiry as the ladder preview, so a steward is never silently stuck.
  maxAge: 60 * 60 * 8,
}

/** What the entity-preview action tells the client to do next. `href` is set when a representative
 *  Space was found (navigate there); when none exists yet, `href` is null and `note` carries the
 *  on-voice line the selector shows instead of erroring. */
export interface EntityPreviewResult {
  href: string | null
  note?: string
}

/**
 * "Preview as entity role" — Host and above. Validates the requested `SpaceType` against the
 * PROVISIONABLE set (a forged or stale value is rejected, so it can never route anywhere it
 * shouldn't), sets the entity-preview cookie, and resolves a representative networked Space of that
 * type to route into. An entity role only has meaning inside a Space, so the preview IS that
 * navigation; it never alters the community ladder or escalates any privilege (applyViewAs returns
 * the real role unchanged for an entity target). Returns the href to navigate to, or a graceful
 * on-voice note when no networked Space of that type exists yet (a role no one has provisioned).
 */
export async function previewAsEntity(type: SpaceType): Promise<EntityPreviewResult> {
  const realRole = await getRealCallerRole()
  // Same gate as the ladder preview: Host and above only. A non-staff caller gets nothing.
  if (!realRole || !canViewAs(realRole)) return { href: null }

  // DOWNGRADE-SAFE validation: only a provisionable entity role (one with a registered blueprint)
  // is ever accepted. root and the not-yet-provisionable roles fail this by construction, so the
  // cookie can only ever hold a real, member-facing entity type.
  if (!isPreviewableEntityRole(type)) return { href: null }

  const jar = await cookies()
  const target: ViewAsTarget = { kind: 'entity', type }
  jar.set(VIEW_AS_COOKIE, serializeViewAsTarget(target), ENTITY_PREVIEW_COOKIE_OPTS)
  // The preview sets the staff-strip cookie + (potentially) chrome, so refresh the shell.
  revalidatePath('/', 'layout')

  // Resolve a representative Space of this type (networked, active, root excluded). Fail-safe: the
  // reader returns null on any error or when no such Space exists yet.
  const space = await representativeSpaceOfType(type)
  if (!space) {
    return {
      href: null,
      note: 'No space of that role is on the network yet, so there is nothing to preview.',
    }
  }
  return { href: `/spaces/${space.slug}` }
}

/** Clear any entity-role preview (back to the staffer's own view). Mirrors selecting your real role
 *  on the ladder. Idempotent: deleting the cookie when none is set is a no-op. */
export async function exitEntityPreview(): Promise<void> {
  const realRole = await getRealCallerRole()
  if (!realRole || !canViewAs(realRole)) return
  const jar = await cookies()
  jar.delete(VIEW_AS_COOKIE)
  revalidatePath('/', 'layout')
}

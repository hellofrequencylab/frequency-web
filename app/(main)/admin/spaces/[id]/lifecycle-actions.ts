'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { logAdminAction } from '@/lib/admin/audit'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { addSpaceMember } from '@/lib/spaces/membership'
import type { SpaceStatus } from '@/lib/spaces/types'

// PLATFORM-ADMIN oversight: Space LIFECYCLE + OWNERSHIP TRANSFER (Entity Management Overhaul EM1-6,
// the oversight spine; docs/ENTITY-MANAGEMENT-OVERHAUL.md §6). These extend the EXISTING admin
// /admin/spaces/[id] surface — they are NOT a parallel console. Every write here is sensitive
// (reassigning ownership), so each one:
//
//   1. RE-CHECKS staff authorization server-side via authorizeAction (never trusts the page gate).
//      Lifecycle is the 'janitor' web_role OR an Operations 'structure'-domain staffer (ADR-127).
//      Ownership transfer is 'janitor' ONLY (the crown-jewel mutation; no staff-domain widening).
//   2. Reads the BEFORE state, validates the change, writes through the service-role admin client
//      SCOPED to the one space id (.eq('id', …)).
//   3. Writes an AUDIT entry (actor · action · target space · before/after) via logAdminAction —
//      best-effort, never blocks the action.
//
// No new schema: `spaces.status` (active/suspended/archived) and `spaces.owner_profile_id` already
// exist, and admin_audit_log.action is free text. No em dashes (operator copy, CONTENT-VOICE).

const ADMIN_PATH = '/admin/spaces'

// `spaces` isn't in the generated DB types yet (ADR-246) — reach it through an untyped client, the
// same pattern lib/spaces/provision.ts + store.ts use. Type the narrow builder surface loosely here.
type SpaceRow = {
  id?: string
  type?: string
  slug?: string
  status?: string
  owner_profile_id?: string | null
  name?: string | null
}

async function readSpace(id: string): Promise<SpaceRow | null> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: SpaceRow | null }> }
        }
      }
    }
    const { data } = await db
      .from('spaces')
      .select('id, type, slug, status, owner_profile_id, name')
      .eq('id', id)
      .maybeSingle()
    return data?.id ? data : null
  } catch {
    return null
  }
}

/** Scoped update of a single Space row (untyped, ADR-246). Returns true on success. */
async function updateSpace(id: string, patch: Record<string, unknown>): Promise<boolean> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
      }
    }
    const { error } = await db.from('spaces').update(patch).eq('id', id)
    return !error
  } catch {
    return false
  }
}

function revalidateSpace(id: string): void {
  revalidatePath(`${ADMIN_PATH}/${id}`)
  revalidatePath(ADMIN_PATH)
  // A status change flips public visibility (RLS shows only active spaces), so repaint the network.
  revalidatePath('/spaces')
  revalidatePath('/', 'layout')
}

const STATUS_VERB: Record<SpaceStatus, string> = {
  active: 'reactivated',
  suspended: 'suspended',
  archived: 'archived',
}

/**
 * Move a Space along the lifecycle (active / suspended / archived) via `spaces.status`. Staff-gated:
 * the 'janitor' web_role OR an Operations 'structure'-domain staffer. The ROOT space is never
 * lifecycle-managed (it serves the app + holds the platform money partition). No-op when already at
 * `to`. Writes an audit entry with the before/after status. Returns ActionResult.
 */
export async function setSpaceStatus(spaceId: string, to: SpaceStatus): Promise<ActionResult> {
  const caller = await getCallerProfile()
  try {
    await authorizeAction(caller, 'janitor', 'structure')
  } catch {
    return fail('Not authorized.')
  }

  if (to !== 'active' && to !== 'suspended' && to !== 'archived') return fail('Unknown status.')
  const id = (spaceId ?? '').trim()
  if (!id) return fail('We could not find that space.')

  const space = await readSpace(id)
  if (!space) return fail('We could not find that space.')
  if (space.type === 'root') return fail('The root space cannot be suspended or archived.')

  const from = (space.status ?? 'active') as SpaceStatus
  if (from === to) return ok()

  if (!(await updateSpace(id, { status: to }))) return fail('Could not save that change.')

  await logAdminAction({
    actorId: caller!.id,
    action: `space.${STATUS_VERB[to]}`,
    targetType: 'space',
    targetId: id,
    detail: { slug: space.slug ?? null, from, to },
  })

  revalidateSpace(id)
  return ok()
}

/**
 * Reassign a Space's owner to another profile (EM1-6). The crown-jewel mutation, so 'janitor' ONLY
 * (no staff-domain widening). The server is the authority on consistency:
 *   1. The new owner must be a real, distinct profile.
 *   2. Update `spaces.owner_profile_id` (the canonical owner reference) AND
 *   3. Seat the new owner as an 'admin' space_member (addSpaceMember upserts on (space_id, profile_id),
 *      so an existing member is promoted rather than duplicated) — so the owner role stays consistent
 *      across the owner column AND the per-Space role ladder, which is how getSpaceCapabilities reads
 *      authority.
 * The previous owner's membership row (if any) is left intact for history; they simply no longer hold
 * the owner reference. Writes an audit entry with before/after owner. Returns ActionResult.
 */
export async function transferSpaceOwnership(
  spaceId: string,
  newOwnerProfileId: string,
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  try {
    await authorizeAction(caller, 'janitor')
  } catch {
    return fail('Not authorized.')
  }

  const id = (spaceId ?? '').trim()
  const newOwner = (newOwnerProfileId ?? '').trim()
  if (!id) return fail('We could not find that space.')
  if (!newOwner) return fail('Pick the new owner.')

  const space = await readSpace(id)
  if (!space) return fail('We could not find that space.')
  if (space.type === 'root') return fail('The root space owner cannot be transferred.')

  const from = space.owner_profile_id ?? null
  if (from === newOwner) return fail('That person already owns this space.')

  // The new owner must be a real profile (fail-closed: validate before any write).
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', newOwner)
    .maybeSingle()
  if (!profile?.id) return fail('We could not find that person.')

  // 1. Update the canonical owner reference.
  if (!(await updateSpace(id, { owner_profile_id: newOwner }))) {
    return fail('Could not transfer ownership. Try again.')
  }

  // 2. Keep the per-Space role ladder consistent: seat the new owner as a space admin. Upsert on
  //    (space_id, profile_id) promotes an existing member instead of duplicating. Best-effort beyond
  //    the owner-reference write, but logged either way so a partial state is visible in the trail.
  const seated = await addSpaceMember({ spaceId: id, profileId: newOwner, role: 'admin', status: 'active' })

  await logAdminAction({
    actorId: caller!.id,
    action: 'space.ownership_transfer',
    targetType: 'space',
    targetId: id,
    detail: { slug: space.slug ?? null, from, to: newOwner, seatedAsAdmin: !!seated },
  })

  revalidateSpace(id)
  return ok()
}

'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { mergeProfileMetaPath } from '@/lib/profiles/meta'
import { logAdminAction } from '@/lib/admin/audit'
import { isJanitor, asWebRole } from '@/lib/core/roles'
import { parseInput, z, uuid } from '@/lib/validation'

// Janitor-only: turn a member's Spotlight (their opt-in public mini-site) ON or OFF.
// This is the per-user switch — the whole feature is dark by default, and a janitor
// flips it for individual members to set up. Crown-jewel gate: the STAFF axis
// (web_role janitor, ADR-208). Mirrors the guard in economy-actions.ts so the
// authz-contract check (scripts/check-authz-guards.mjs) recognizes it.
async function requireJanitor(): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, web_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile || !isJanitor(asWebRole(profile.web_role))) {
    throw new Error('Janitor only')
  }
  return { id: profile.id }
}

const input = z.object({ profileId: uuid, enabled: z.boolean() })

/**
 * Flip `meta.spotlight.enabled` for a target member. Only toggles `enabled` (setup),
 * never `published` (going live stays an explicit owner act).
 *
 * 2026-09-07 (LIVE-171, ADR-1235): the write sends ONLY `enabled`, merged INSIDE the `spotlight`
 * key server-side (merge_profile_meta_path). Nothing is read back and re-sent, so the owner
 * publishing or setting a theme in the same second is never reverted by this switch.
 */
export async function toggleSpotlightEnabled(profileId: string, enabled: boolean): Promise<void> {
  const caller = await requireJanitor()
  const { profileId: pid, enabled: on } = parseInput(input, { profileId, enabled })

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id')
    .eq('id', pid)
    .maybeSingle()
  if (!target) throw new Error('Member not found')

  const { error } = await mergeProfileMetaPath(admin, pid, ['spotlight'], { enabled: on })
  if (error) throw new Error(error)

  await logAdminAction({
    actorId: caller.id,
    action: 'spotlight.toggle',
    targetType: 'profile',
    targetId: pid,
    detail: { enabled: on },
  })

  revalidatePath('/admin/members')
}

/**
 * Reset a member's Spotlight to default (janitor): clears their custom layout +
 * background + theme and force-unpublishes, but KEEPS the enable flag and any earned
 * cosmetics. The moderation "make this page calm again" lever.
 */
export async function resetSpotlightToDefault(profileId: string): Promise<void> {
  const caller = await requireJanitor()
  const { profileId: pid } = parseInput(z.object({ profileId: uuid }), { profileId })

  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('id').eq('id', pid).maybeSingle()
  if (!target) throw new Error('Member not found')

  // 2026-09-07 (LIVE-171): the three calmed fields merge INSIDE the `spotlight` key server-side, so
  // `enabled` and any saved theme slots survive untouched. profile_theme is a top-level column
  // outside the RPC's allowlist, so it is a second, checked update after the merge landed.
  const { error } = await mergeProfileMetaPath(admin, pid, ['spotlight'], {
    layout: null,
    background: null,
    published: false,
  })
  if (error) throw new Error(error)
  const { error: themeErr } = await admin.from('profiles').update({ profile_theme: null }).eq('id', pid)
  if (themeErr) throw new Error(themeErr.message)

  await logAdminAction({ actorId: caller.id, action: 'spotlight.reset', targetType: 'profile', targetId: pid })
  revalidatePath('/admin/members')
}

/** Force-unpublish a member's Spotlight (janitor): takes the public page down without
 *  touching their layout, so they can fix it and re-publish. */
export async function forceUnpublishSpotlight(profileId: string): Promise<void> {
  const caller = await requireJanitor()
  const { profileId: pid } = parseInput(z.object({ profileId: uuid }), { profileId })

  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('id').eq('id', pid).maybeSingle()
  if (!target) throw new Error('Member not found')

  // 2026-09-07 (LIVE-171): only `published` is sent, merged INSIDE the `spotlight` key server-side.
  const { error } = await mergeProfileMetaPath(admin, pid, ['spotlight'], { published: false })
  if (error) throw new Error(error)

  await logAdminAction({ actorId: caller.id, action: 'spotlight.force_unpublish', targetType: 'profile', targetId: pid })
  revalidatePath('/admin/members')
}

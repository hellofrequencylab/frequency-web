'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logAdminAction } from '@/lib/admin/audit'
import { isJanitor, type WebRole } from '@/lib/core/roles'
import { parseInput, z, uuid } from '@/lib/validation'
import { withSpotlightEnabled } from '@/lib/profile/spotlight-flags'

// Janitor-only: turn a member's Spotlight (their opt-in public mini-site) ON or OFF.
// This is the per-user switch — the whole feature is dark by default, and a janitor
// flips it for individual members to set up. Crown-jewel gate: the STAFF axis
// (web_role janitor, ADR-208), read via the untyped cast. Mirrors the guard in
// economy-actions.ts so the authz-contract check (scripts/check-authz-guards.mjs)
// recognizes it.
async function requireJanitor(): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const admin = createAdminClient()
  const { data: profile } = await (admin)
    .from('profiles')
    .select('id, web_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile || !isJanitor(profile.web_role as WebRole | null)) {
    throw new Error('Janitor only')
  }
  return { id: profile.id as string }
}

const input = z.object({ profileId: uuid, enabled: z.boolean() })

/**
 * Flip `meta.spotlight.enabled` for a target member. Only toggles `enabled` (setup),
 * never `published` (going live stays an explicit owner act). Read-modify-write of the
 * opaque meta blob, isolating the spotlight sub-object so streak/checkin keys survive
 * (see lib/profile/spotlight-flags.ts withSpotlightEnabled).
 */
export async function toggleSpotlightEnabled(profileId: string, enabled: boolean): Promise<void> {
  const caller = await requireJanitor()
  const { profileId: pid, enabled: on } = parseInput(input, { profileId, enabled })

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('meta')
    .eq('id', pid)
    .maybeSingle()
  if (!target) throw new Error('Member not found')

  const nextMeta = withSpotlightEnabled((target as { meta?: unknown }).meta, on)
  const { error } = await admin
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('id', pid)
  if (error) throw new Error(error.message)

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
  const { data: target } = await admin.from('profiles').select('meta').eq('id', pid).maybeSingle()
  if (!target) throw new Error('Member not found')

  const base = ((target as { meta?: unknown }).meta ?? {}) as { spotlight?: Record<string, unknown> }
  const nextMeta = {
    ...base,
    spotlight: { ...(base.spotlight ?? {}), layout: null, background: null, published: false },
  }
  const { error } = await admin
    .from('profiles')
    .update({ meta: nextMeta as never, profile_theme: null })
    .eq('id', pid)
  if (error) throw new Error(error.message)

  await logAdminAction({ actorId: caller.id, action: 'spotlight.reset', targetType: 'profile', targetId: pid })
  revalidatePath('/admin/members')
}

/** Force-unpublish a member's Spotlight (janitor): takes the public page down without
 *  touching their layout, so they can fix it and re-publish. */
export async function forceUnpublishSpotlight(profileId: string): Promise<void> {
  const caller = await requireJanitor()
  const { profileId: pid } = parseInput(z.object({ profileId: uuid }), { profileId })

  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('meta').eq('id', pid).maybeSingle()
  if (!target) throw new Error('Member not found')

  const base = ((target as { meta?: unknown }).meta ?? {}) as { spotlight?: Record<string, unknown> }
  const nextMeta = { ...base, spotlight: { ...(base.spotlight ?? {}), published: false } }
  const { error } = await admin.from('profiles').update({ meta: nextMeta as never }).eq('id', pid)
  if (error) throw new Error(error.message)

  await logAdminAction({ actorId: caller.id, action: 'spotlight.force_unpublish', targetType: 'profile', targetId: pid })
  revalidatePath('/admin/members')
}

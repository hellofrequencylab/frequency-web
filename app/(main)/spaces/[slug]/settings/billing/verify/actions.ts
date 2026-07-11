'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { submitNonprofitVerification } from '@/lib/spaces/nonprofit-verification'
import { type ActionResult, fail } from '@/lib/action-result'

// NON PROFIT VERIFICATION — the client-callable submit seam (ADR-552, AUDIT #6). Re-resolves the Space +
// gates on canManage (the owner/admin/editor write authority) so a non-owner cannot submit for someone
// else's Space, then hands off to the self-gating lib helper (which re-checks canEditProfile and
// validates the EIN + legal name). No em dashes (CONTENT-VOICE §10).

/** Submit the calling owner's Space for Non Profit (501(c)(3)) verification. GATED: resolves the Space
 *  by slug and requires canManage; the lib helper re-checks server-side and validates the input. */
export async function requestNonprofitVerification(
  slug: string,
  input: { ein: string; orgLegalName: string },
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return fail('Space not found.')
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return fail('You do not have access to manage this space.')

  const res = await submitNonprofitVerification(space.id, input)
  revalidatePath(`/spaces/${slug}/settings/billing/verify`)
  revalidatePath(`/spaces/${slug}/settings/billing`)
  return res
}

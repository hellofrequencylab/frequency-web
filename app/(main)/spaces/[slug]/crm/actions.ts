'use server'

// Per-Space autonomy slider setter (Resonance Engine Phase 3 · ADR-384). The owner-facing control
// on the Space CRM cockpit sets how much the playbook engine may DO on its own for THIS Space:
//   • suggest_only (the default) — Vera drafts, a human approves everything; nothing auto-executes.
//   • safe_auto                  — the in-product, reversible `auto` playbooks (the streak save) may
//                                  run on their own. Member-facing sends stay Suggest, always.
//
// SELF-GUARDED: re-resolves the Space from the slug and re-gates caps.canManageMembers (owner/admin)
// server-side, so a non-owner can never raise another operator's autonomy. The write goes through the
// service-role admin client SCOPED to the resolved space id (.eq('id', …)) — the binding scope. The
// setting is sparse on the `spaces.entitlements` jsonb (key `crm.autonomy`): the safe default deletes
// the key (back to suggest_only), so the blob never collects a redundant suggest_only entry.
//
// No em or en dashes (owner copy, CONTENT-VOICE §10).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities, asAutonomyLevel, DEFAULT_AUTONOMY, type AutonomyLevel } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** Set the autonomy level for the owner's own Space. Owner/admin-gated; the write is scoped to the
 *  resolved space id. The level is normalized fail-closed (an unknown value reads as suggest_only). */
export async function setSpaceAutonomy(slug: string, level: AutonomyLevel | string): Promise<ActionResult> {
  const next = asAutonomyLevel(level)

  // Re-resolve + re-gate server-side (never trust the client): owner / admin only.
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return fail('You do not have access to manage this space.')
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canManageMembers) return fail('Only an owner or admin can change this.')

  // Sparse write: the safe default removes the key; anything else stamps it. Scoped to the space id.
  const current = space.entitlements && typeof space.entitlements === 'object' && !Array.isArray(space.entitlements)
    ? { ...(space.entitlements as Record<string, unknown>) }
    : {}
  if (next === DEFAULT_AUTONOMY) delete current['crm.autonomy']
  else current['crm.autonomy'] = next

  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update({ entitlements: current }).eq('id', space.id)
  if (error) return fail('Could not save that change.')

  revalidatePath(`/spaces/${slug}/crm`)
  return ok()
}

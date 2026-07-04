// GRADUATION: personal My Contacts -> a paid Space CRM (CRM-STRATEGY §6, ADR-361 P3). The graduation
// moment is STRUCTURAL, not a migration: a Space owner brings their `network_contacts` (optionally a
// status/tag subset) into the Space's shared `contacts(space_id)` via the upsert-by-email bridge,
// links each personal row back through `linked_contact_id`, and seeds one open `crm_deal` per imported
// contact in the Space's first open stage.
//
// SHAPE (mirrors lib/crm/client-notes.ts): no 'use server' directive here, so it can export the result
// type + the pure filter helper for tests. The thin 'use server' wrapper the client form calls lives
// in lib/crm/graduation-actions.ts. Authorization + validation live in this implementation.
//
// GATING: only the Space OWNER (canEditProfile) may import, and only INTO their own Space, and only
// THEIR OWN network_contacts (every read filters owner_id). FAIL-SAFE: a permission miss or any error
// imports nothing and returns an error / a zeroed result; a missing-email or already-linked contact is
// SKIPPED, so re-running is idempotent. No member-facing copy here; the surface owns the words.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { createAdminClient } from '@/lib/supabase/admin'
import { listContacts } from '@/lib/connections/store'
import { syncContactToSpaceCrm } from '@/lib/connections/crm-sync'
import { ensureSpaceStages, getFirstOpenStage } from '@/lib/crm/pipeline'
import type { NetworkContactListItem } from '@/lib/connections/types'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** Optional narrowing for which personal contacts graduate. Absent = all of the owner's contacts. */
export interface GraduationFilter {
  /** Lifecycle status to include ('new' | 'active' | 'archived'); absent = any status. */
  status?: string
  /** A single tag to include; absent = any tag. Matched case-insensitively. */
  tag?: string
}

/** The outcome of an import run. `imported` is contacts newly bridged + dealt this run; `skipped` is
 *  contacts left as-is (already linked, or no email to dedupe on); `total` is the filtered candidates. */
export interface GraduationResult {
  imported: number
  skipped: number
  total: number
}

/** PURE: does a personal contact pass the optional status/tag filter? Used by the import and unit-
 *  testable on its own. An absent filter field matches everything; tag match is case-insensitive. */
export function matchesGraduationFilter(c: NetworkContactListItem, filter: GraduationFilter): boolean {
  if (filter.status && c.status !== filter.status) return false
  if (filter.tag) {
    const want = filter.tag.trim().toLowerCase()
    if (want && !c.tags.some((t) => t.toLowerCase() === want)) return false
  }
  return true
}

/**
 * Bring the OWNER's personal contacts into a Space's CRM. Owner-gated (canEditProfile) AND
 * entitlement-gated (spaceHasEntitlement crm). For each filtered, not-yet-linked contact WITH an
 * email: upsert into contacts(space_id) (consent stays 'unknown'), link the personal row via
 * linked_contact_id, and seed one open crm_deal in the Space's first open stage. Idempotent +
 * fail-safe.
 */
export async function importContactsToSpace(
  spaceId: string,
  filter: GraduationFilter = {},
): Promise<ActionResult<GraduationResult>> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in to bring your contacts in.')
  if (!spaceId) return fail('We could not find that space.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('We could not find that space.')

  // Gate (defense in depth, mirrors the CRM board page): the per-Space resolver folds the plan
  // ENTITLEMENT and the CRM MIN-ROLE (default 'admin') into one decision. We keep the entitlement read
  // to split the error message. The viewer's space role comes from caps.role (owner reports 'admin').
  const caps = await getSpaceCapabilities(space, me)
  if (!spaceFunctionAccess(space, 'crm', caps.role)) {
    return spaceHasEntitlement(space, 'crm')
      ? fail('Only this space’s team can bring contacts in.')
      : fail('This space does not have a CRM yet.')
  }

  // Make sure the Space has its per-segment starting pipeline before we seed deals into it.
  await ensureSpaceStages(spaceId, space.type, space.modeVariant)
  const firstOpen = await getFirstOpenStage(spaceId)

  // The owner's own contacts, narrowed by the optional status/tag filter.
  let candidates: NetworkContactListItem[]
  try {
    const all = await listContacts(me, 1000)
    candidates = all.filter((c) => matchesGraduationFilter(c, filter))
  } catch {
    return fail('We could not read your contacts. Try again.')
  }

  let imported = 0
  let skipped = 0
  const db = createAdminClient()

  for (const c of candidates) {
    // Skip the already-graduated (idempotent): linkedContactId is the shared-CRM bridge (NOT
    // linkedProfileId, which is the member merge). Skip anyone without an email to dedupe on.
    if (c.linkedContactId) {
      skipped++
      continue
    }
    const email = (c.email ?? '').trim().toLowerCase()
    if (!email) {
      skipped++
      continue
    }

    const contactId = await syncContactToSpaceCrm({
      ownerId: me,
      spaceId,
      networkContactId: c.id,
      email,
      displayName: c.displayName,
    })
    if (!contactId) {
      skipped++
      continue
    }

    // Seed one open deal per imported contact in the first open stage (best-effort; a deal failure
    // does not un-import the contact, it just means no deal card yet).
    try {
      await db.from('crm_deals').insert({
        space_id: spaceId,
        title: c.displayName ? `${c.displayName}` : email,
        contact_name: c.displayName ?? null,
        contact_id: contactId,
        stage_id: firstOpen?.id ?? null,
        status: firstOpen?.kind ?? 'open',
        owner_id: me,
        created_by: me,
        source: 'graduation',
      })
    } catch {
      /* the contact is in; the deal seed is best-effort */
    }

    imported++
  }

  if (imported > 0) {
    revalidatePath(`/spaces/${space.slug}/crm`)
    revalidatePath('/network/contacts')
  }

  return ok({ imported, skipped, total: candidates.length })
}

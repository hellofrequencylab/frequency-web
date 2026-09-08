'use server'

// SPACE-SCOPED Practice authoring. A Practice built here is STAMPED to the Space (space_id), owned by
// the Space, and usable by its members immediately (the space-scoped read ignores is_public / status).
// It is created PRIVATE (is_public = false) and NOT library-approved (status = 'draft'): it skips the
// public-library review queue, exactly the "usable by your own space members, but approval is needed
// for the main library" rule. Listing it in the PUBLIC library later is the paid-Crew + review path
// (the existing publish/flags flow on the practice), unchanged.
//
// Gated on MANAGING the Space (owner / admin / editor), not the person's member tier, so a free member
// running a Space can build the practices their members do. Mirrors createPracticeDraftAction but
// resolves + stamps the Space and drops the review gate for own-space content.

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { createAdminClient } from '@/lib/supabase/admin'
import { canCreate } from '@/lib/core/load-capabilities'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
import { createPractice, getPractice, setPracticeStatus, notifyStaffOfPendingPractice } from '@/lib/practices'

async function authorizeSpaceAuthor(
  slug: string,
): Promise<{ spaceId: string; profileId: string } | { error: string }> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Sign in to build in this space.' }
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return { error: 'Space not found.' }
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile) return { error: 'You do not manage this space.' }
  return { spaceId: space.id, profileId: caller.id }
}

/**
 * Create a blank Practice stamped to this Space and drop the author into the full editor to name it,
 * set its timer, and write the guide. Private + not library-approved at birth (usable by the Space,
 * out of the public library until the paid-Crew + review publish path is taken). Redirects back to the
 * manager on any guard failure.
 */
export async function createSpacePracticeAction(slug: string): Promise<void> {
  const gate = await authorizeSpaceAuthor(slug)
  if ('error' in gate) redirect(`/spaces/${slug}/practices`)

  // THE GOVERNED WRITE (ADR-988, ADR-1249, ADR-1280). A blank Space practice is still a member's
  // create, so it proposes, claims and commits through the same writer and lands in the audit log.
  // THIS ROAD DECLARES ITS OWN GATE. CREATE_GATES makes `practice` a Crew-only `practice.create`
  // capability, which is the gate on the PUBLIC library (submitSpacePracticeToLibraryAction below
  // still holds it). This road is deliberately open to anyone who manages the Space, and that
  // check, authorizeSpaceAuthor, already ran above; the layer records it in place of the
  // capability rather than refusing the free Space manager the road exists for. The road is named
  // in ROAD_GATES (scripts/check-creates.mjs), so this declaration is reviewed, not silent.
  const governed = await proposeAndConfirmCreate({
    entity: 'practice',
    draft: { title: 'Untitled practice' },
    spaceId: gate.spaceId,
    roadGate: {
      kind: 'scoped',
      why: 'authorizeSpaceAuthor: the caller manages this Space (canEditProfile: owner, admin or editor). Own-Space practices are free to build; practice.create gates the public library, not this road.',
    },
    rationale: 'Space practices, blank road: a Space manager opened a fresh draft for their members.',
    commit: async () => {
      const practice = await createPractice({
        title: 'Untitled practice',
        createdBy: gate.profileId,
        spaceId: gate.spaceId,
        // Usable by the Space's members immediately, but not in the public library and not
        // library-approved: reaching the main library is the separate paid-Crew + review step.
        isPublic: false,
        status: 'draft',
      })
      if (!practice) throw new Error('Could not create the practice.')
      return practice
    },
  })
  // This road returns void and redirects back to the manager on any failure, exactly as it did
  // when a failed write returned null; the layer's refusal is answered the same way.
  if ('error' in governed) redirect(`/spaces/${slug}/practices`)

  redirect(`/practices/${governed.data.id}/edit`)
}

/**
 * Read the owning Space of a practice. `space_id` is not in the generated Database types
 * (ADR-246) and is not exposed on the `Practice` shape, so it is reached through an untyped
 * admin handle, the same pattern lib/practices uses. Returns null when the practice is missing.
 */
async function practiceSpaceId(practiceId: string): Promise<string | null> {
  type Chain = {
    select: (cols: string) => Chain
    eq: (col: string, val: string) => Chain
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>
  }
  const { data } = await (createAdminClient().from('practices') as unknown as Chain)
    .select('space_id')
    .eq('id', practiceId)
    .maybeSingle()
  return (data as { space_id: string | null } | null)?.space_id ?? null
}

/**
 * Make a Space-stamped practice LIVE to its own members: flip status to 'approved'. This is the
 * own-space go-live, with NO staff review (the practice never leaves the Space; reaching the public
 * library is the separate submit path below). Re-gated on managing the Space, and the practice must
 * belong to this Space, so an author cannot flip another Space's content.
 */
export async function setSpacePracticeLiveAction(slug: string, practiceId: string): Promise<ActionResult> {
  const gate = await authorizeSpaceAuthor(slug)
  if ('error' in gate) return fail(gate.error)

  if ((await practiceSpaceId(practiceId)) !== gate.spaceId) return fail('Not allowed.')

  await setPracticeStatus(practiceId, 'approved')
  revalidatePath(`/spaces/${slug}/practices`)
  return ok()
}

/**
 * Propose a Space practice for the PUBLIC library: flip status to 'pending' and ping the curators.
 * Two gates, both required: the caller must manage the Space (author gate) AND hold paid Crew, because
 * the public library is the paid surface (own-space go-live above stays free). is_public is left alone
 * on purpose: staff approval is what lists it publicly, not this action. The staff notification is
 * best-effort and never blocks the submit.
 */
export async function submitSpacePracticeToLibraryAction(slug: string, practiceId: string): Promise<ActionResult> {
  const gate = await authorizeSpaceAuthor(slug)
  if ('error' in gate) return fail(gate.error)

  if (!(await canCreate('practice.create')))
    return fail('Listing a practice in the library comes with Crew. Upgrade your membership to submit it.')

  const practice = await getPractice(practiceId)
  if (!practice || (await practiceSpaceId(practiceId)) !== gate.spaceId) return fail('Not allowed.')

  await setPracticeStatus(practiceId, 'pending')
  // Best-effort: notifyStaffOfPendingPractice never throws, so a failed ping cannot block the submit.
  await notifyStaffOfPendingPractice({ practiceId, title: practice.title, proposedBy: gate.profileId })
  revalidatePath(`/spaces/${slug}/practices`)
  return ok()
}

'use server'

// SPACE-SCOPED Journey authoring (the practitioner's programs). A Journey built here is STAMPED to the
// Space (space_id), so it belongs to the Space and surfaces on its profile + this manager. Space
// authoring is gated on MANAGING the Space (owner / admin / editor), NOT on the person's member tier,
// so a free member running a Space can build their program. It skips the public-library review queue
// (it is the operator's own product, private until they publish); publishing is governed by the
// free-vs-paid lever in setJourneyVisibility (lib/journeys/publish-gate). Mirrors the personal
// create-actions (app/(main)/journeys/create-actions.ts) but resolves + stamps the Space.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { createPlan } from '@/lib/journey-plans'
import { createAdminClient } from '@/lib/supabase/admin'

/** Resolve the Space from its slug and assert the caller may author in it (owner / admin / editor).
 *  Returns the space id + caller id, or an error string the action turns into a safe redirect. */
async function authorizeSpaceAuthor(
  slug: string,
): Promise<{ spaceId: string; profileId: string } | { error: string }> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Sign in to build in this space.' }
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return { error: 'Space not found.' }
  const caps = await getSpaceCapabilities(space, caller.id)
  // canEditProfile = owner / admin / editor (the same authority that edits the Space profile).
  if (!caps.canEditProfile) return { error: 'You do not manage this space.' }
  return { spaceId: space.id, profileId: caller.id }
}

/**
 * Create a Journey stamped to this Space (as a private draft), seed three empty Phases so the
 * curriculum opens ready to edit, and drop the author into the editor. No public-library review at
 * birth (Space-authored content is the operator's own program); the free-vs-paid publish lever runs
 * later, at publish (setJourneyVisibility). On any guard failure it redirects back to the manager.
 */
export async function createSpaceJourneyAction(slug: string, title: string): Promise<void> {
  const gate = await authorizeSpaceAuthor(slug)
  if ('error' in gate) redirect(`/spaces/${slug}/journeys`)
  const clean = title.trim().slice(0, 120)
  if (!clean) redirect(`/spaces/${slug}/journeys`)

  const plan = await createPlan({ authorId: gate.profileId, title: clean, spaceId: gate.spaceId })
  if (!plan) redirect(`/spaces/${slug}/journeys`)

  // Three phase boxes, ready to edit (the author fills them, or rebuilds with Vera) — same seed as the
  // personal draft path so the editor opens identically.
  const admin = createAdminClient()
  await admin.from('journey_plan_items').insert(
    [0, 1, 2].map((i) => ({
      plan_id: plan.id,
      block_type: 'phase',
      parent_id: null,
      title: `Phase ${i + 1}`,
      sort_order: i,
      required: true,
    })),
  )

  redirect(`/journeys/${plan.slug}/edit`)
}

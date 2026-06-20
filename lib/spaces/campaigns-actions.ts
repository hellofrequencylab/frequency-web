'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for per-Space campaigns (ENTITY-SPACES-BUILD §C Phase 3).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure validation
// helpers or the shared types. Those live in lib/spaces/campaigns.ts (no directive: pure helpers + IO
// + the action implementations + types, all unit-testable). This thin file is the seam the CLIENT
// surfaces import, so the mutations cross the network boundary as proper Server Actions:
//   composer-form.tsx     -> createSpaceCampaign / updateSpaceCampaign
//   composer-send.tsx      -> scheduleSpaceCampaign / sendSpaceCampaign
//   email-enable-card.tsx  -> setSpaceEmailEnabled (the backbone kill-switch, @/lib/spaces/email-toggle)
//
// SERVER components (the page, campaign-list) import the READ action (listSpaceCampaigns) directly
// from lib/spaces/campaigns.ts: it never crosses a client boundary, so it needs no wrapper. The
// authorization + validation all live in the implementations; these wrappers just re-expose them and
// revalidate the surface so the list reflects the change.

import { revalidatePath } from 'next/cache'
import {
  createSpaceCampaign as createSpaceCampaignImpl,
  updateSpaceCampaign as updateSpaceCampaignImpl,
  scheduleSpaceCampaign as scheduleSpaceCampaignImpl,
  sendSpaceCampaign as sendSpaceCampaignImpl,
  type CampaignInput,
} from '@/lib/spaces/campaigns'
import { setSpaceEmailEnabled as setSpaceEmailEnabledImpl } from '@/lib/spaces/email-toggle'
import { audienceCount as audienceCountImpl, type AudienceFilter } from '@/lib/spaces/audiences'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isJanitor } from '@/lib/core/roles'
import { type ActionResult } from '@/lib/action-result'

// The Space email surface lives at /spaces/<slug>/settings/email. We revalidate the layout path so the
// campaign list + status reflect a create / update / schedule / send (mirrors the global composer's
// revalidatePath of its surface).
function revalidateEmail(slug: string) {
  revalidatePath(`/spaces/${slug}/settings/email`)
}

/** Create a draft campaign. Gated on canEditProfile (see the implementation). */
export async function createSpaceCampaign(
  spaceId: string,
  slug: string,
  input: CampaignInput,
): Promise<ActionResult<{ id: string }>> {
  const res = await createSpaceCampaignImpl(spaceId, input)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}

/** Update a draft campaign's subject / body. Gated on canEditProfile (see the implementation). */
export async function updateSpaceCampaign(
  spaceId: string,
  slug: string,
  id: string,
  input: Partial<CampaignInput>,
): Promise<ActionResult> {
  const res = await updateSpaceCampaignImpl(spaceId, id, input)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}

/** Schedule a campaign for a future send time. Gated on canEditProfile (see the implementation). */
export async function scheduleSpaceCampaign(
  spaceId: string,
  slug: string,
  id: string,
  when: string,
): Promise<ActionResult> {
  const res = await scheduleSpaceCampaignImpl(spaceId, id, when)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}

/** Send a campaign now to a resolved audience. Gated on canEditProfile; the implementation resolves
 *  the audience and hands it to the send backbone (@/lib/spaces/email), then revalidates the surface. */
export async function sendSpaceCampaign(
  spaceId: string,
  slug: string,
  id: string,
  filter: AudienceFilter,
): Promise<ActionResult<{ recipientCount: number }>> {
  const res = await sendSpaceCampaignImpl(spaceId, id, filter)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}

/** The live recipient count for an audience filter (the picker shows it as the owner picks). Gated on
 *  canEditProfile (owner / admin / editor) OR a janitor staff preview, so a non-editor never probes a
 *  Space's contact count. FAIL-SAFE to 0. The COUNT here can never disagree with the eventual send,
 *  because both resolve through resolveAudience. */
export async function countSpaceAudience(
  spaceId: string,
  filter: AudienceFilter,
): Promise<number> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return 0
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return 0
  return audienceCountImpl(spaceId, filter)
}

/** Turn this Space's email on / off (the per-Space kill-switch). `acknowledged` is the owner's
 *  anti-spam confirmation, required to ENABLE. Gated on canEditProfile (see the implementation in
 *  @/lib/spaces/email-toggle, the backbone kill-switch). */
export async function setSpaceEmailEnabled(
  spaceId: string,
  slug: string,
  enabled: boolean,
  acknowledged: boolean,
): Promise<ActionResult> {
  const res = await setSpaceEmailEnabledImpl(spaceId, enabled, acknowledged)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}

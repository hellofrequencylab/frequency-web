'use server'

// The operator's door-link maker (CRM-MASTER-BUILD-PLAN §Phase 3). One place for the Space team to mint
// the shareable links behind front doors 2 to 5. Every action RE-RESOLVES the Space from the slug and
// RE-GATES server-side (CRM entitlement + editor rights) — the client is never trusted with a spaceId.
// The link's context is baked into a signed token (lib/crm/lead-links), so the public capture surface
// reads only what we minted.
//
// Warm intro is special: minting its link SEALS the lead now (captureWarmIntro, NOT mailable) and points
// at the accept surface, where the introduced person's own click is the opt-in. The other three doors
// mint a link only; the capture happens when the visitor submits.

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { captureWarmIntro } from '@/lib/crm/lead-capture'
import { makeLeadLinkPayload, buildLeadLinkUrl, isSafeHttpUrl } from '@/lib/crm/lead-links'
import { SITE_URL } from '@/lib/site'

export type LinkResult = { ok: true; url: string } | { ok: false; error: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type Gate =
  | { ok: false; error: string }
  | { ok: true; spaceId: string; callerId: string | null; brand: string }

/** Re-resolve + re-gate: only a CRM-entitled editor/owner of THIS Space may mint its links. */
async function gate(slug: string): Promise<Gate> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return { ok: false, error: 'You do not have access to manage this space.' }
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) return { ok: false, error: 'Only the people who run this space can make capture links.' }
  const canUseCrm = await spaceFunctionAccessLive(space, 'crm', caps.role, space.plan)
  if (!canUseCrm) return { ok: false, error: 'Your plan does not include the CRM.' }
  if (!space.id) return { ok: false, error: 'Could not resolve this space.' }
  return { ok: true, spaceId: space.id, callerId: viewerProfileId, brand: space.brandName ?? space.name }
}

/** Door 2 — seal the warm intro now (NOT mailable) and return the accept link the introducer shares. */
export async function createWarmIntroLink(
  slug: string,
  input: { email: string; name?: string },
): Promise<LinkResult> {
  const g = await gate(slug)
  if (!g.ok) return { ok: false, error: g.error }

  const email = (input.email || '').trim().toLowerCase()
  const name = (input.name || '').trim() || null
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email for the person you are introducing.' }

  // Seal the lead now — double-opt-in means it stays NOT mailable until they accept.
  const captured = await captureWarmIntro({
    spaceId: g.spaceId,
    email,
    displayName: name,
    vouchedByProfileId: g.callerId,
    label: 'Warm intro',
  })
  if (!captured) return { ok: false, error: 'Could not start that introduction. Please try again.' }

  const url = buildLeadLinkUrl(
    SITE_URL,
    makeLeadLinkPayload({ s: g.spaceId, d: 'warm_intro', c: captured.contactId, by: g.brand }),
  )
  return url ? { ok: true, url } : { ok: false, error: 'Could not build that link. Please try again.' }
}

/** Door 3 — an event / attendance check-in link (title + tier). No capture until an attendee submits. */
export async function makeEventLink(
  slug: string,
  input: { eventTitle?: string; tier?: string },
): Promise<LinkResult> {
  const g = await gate(slug)
  if (!g.ok) return { ok: false, error: g.error }
  const title = (input.eventTitle || '').trim() || null
  const tier = (input.tier || '').trim() || 'attended'
  const url = buildLeadLinkUrl(
    SITE_URL,
    makeLeadLinkPayload({ s: g.spaceId, d: 'event', ...(title ? { w: title, l: title } : {}), tr: tier }),
  )
  return url ? { ok: true, url } : { ok: false, error: 'Could not build that link. Please try again.' }
}

/** Door 4 — a consent-native lead-magnet unlock link (label + the resource to reveal). */
export async function makeMagnetLink(
  slug: string,
  input: { label: string; resourceUrl?: string },
): Promise<LinkResult> {
  const g = await gate(slug)
  if (!g.ok) return { ok: false, error: g.error }
  const label = (input.label || '').trim()
  if (!label) return { ok: false, error: 'Name the thing people get (a guide, a discount, a checklist).' }
  const resource = (input.resourceUrl || '').trim()
  if (resource && !isSafeHttpUrl(resource)) {
    return { ok: false, error: 'The link to the resource must start with http:// or https://.' }
  }
  const url = buildLeadLinkUrl(
    SITE_URL,
    makeLeadLinkPayload({ s: g.spaceId, d: 'lead_magnet', l: label, ...(resource ? { r: resource } : {}) }),
  )
  return url ? { ok: true, url } : { ok: false, error: 'Could not build that link. Please try again.' }
}

/** Door 5 — a reciprocal share-back link (the card the visitor gets in return). */
export async function makeExchangeLink(
  slug: string,
  input: { tagline?: string; profileUrl?: string },
): Promise<LinkResult> {
  const g = await gate(slug)
  if (!g.ok) return { ok: false, error: g.error }
  const tagline = (input.tagline || '').trim() || null
  const profileUrl = (input.profileUrl || '').trim()
  if (profileUrl && !isSafeHttpUrl(profileUrl)) {
    return { ok: false, error: 'The page link must start with http:// or https://.' }
  }
  const url = buildLeadLinkUrl(
    SITE_URL,
    makeLeadLinkPayload({
      s: g.spaceId,
      d: 'share_back',
      by: g.brand,
      ...(tagline ? { l: tagline } : {}),
      ...(profileUrl ? { r: profileUrl } : {}),
    }),
  )
  return url ? { ok: true, url } : { ok: false, error: 'Could not build that link. Please try again.' }
}

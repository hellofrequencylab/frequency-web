// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — ADOPT a hand-made Space into an editable MASTER PROFILE (Importer v2).
//
// The seeder's normal flow is research → draft → Apply → a live Space, and the intake it leaves behind
// IS the master profile. But a Space created BY HAND (never seeded) has no intake, so it cannot be
// re-seeded. This module runs that flow in REVERSE: it reads a live Space's own content and builds a
// BusinessProfile draft + a ledger that marks every fact HUMAN-VERIFIED (the owner authored it, so it
// publishes and nothing is withheld), then stores it as an already-'applied' intake bound to the Space.
//
// After adoption the Space behaves exactly like a seeded one: the review board edits its master profile
// field by field, a mood re-seed re-voices the marketing blocks (primary info stays locked by default),
// and Manage Spaces links straight back to it. PURE core (profileFromSpace) + a thin adopt orchestrator.
// ─────────────────────────────────────────────────────────────────────────────

import { getSpaceById } from '@/lib/spaces/store'
import { readProfileData, type SpaceProfileData } from '@/lib/spaces/profile-data'
import type { Space } from '@/lib/spaces/types'
import { createMasterProfile, getIntakeBySpaceId } from './store'
import type { BusinessProfile, LedgerEntry, ProfileOffering, ProvenanceLedger } from './schema'
import type { IntakeInputs } from './intake'

/** A human-verified ledger fact: the owner already published this on their live Space, so it is trusted
 *  and the commercial-fact gate clears it (kind:'fact' && verifiedBy:'human'). */
function humanFact(): LedgerEntry {
  return { kind: 'fact', confidence: 1, verifiedBy: 'human' }
}

/**
 * Build a BusinessProfile draft + a human-verified ledger + a first-image list FROM a live Space's own
 * content. PURE + total: a Space with sparse content yields a sparse-but-valid draft. Every present
 * commercial fact (contact, hours, rating, offering prices) is marked human-verified so it publishes on
 * a re-apply; identity + prose carry no ledger entry (hand-supplied, publishes) so a later re-seed may
 * re-voice them unless locked.
 */
export function profileFromSpace(
  space: Space,
  data: SpaceProfileData,
): { draft: BusinessProfile; ledger: ProvenanceLedger; images: string[] } {
  const type: BusinessProfile['type'] = space.type === 'nonprofit' ? 'nonprofit' : 'business'

  const offerings: ProfileOffering[] = (data.offerings ?? []).map((o) => ({
    title: o.title,
    ...(o.blurb ? { blurb: o.blurb } : {}),
    ...(typeof o.price === 'number' ? { price: o.price } : {}),
    ...(o.currency ? { currency: o.currency } : {}),
    ...(o.priceModel ? { priceModel: o.priceModel } : {}),
    ...(typeof o.durationMinutes === 'number' ? { durationMinutes: o.durationMinutes } : {}),
  }))

  const draft: BusinessProfile = {
    name: space.name,
    type,
    ...(space.brandName ? { brandName: space.brandName } : {}),
    ...(space.tagline ? { tagline: space.tagline } : {}),
    ...(space.brandAccent ? { accent: space.brandAccent } : {}),
    ...(data.about ? { about: data.about } : {}),
    contact: {
      ...(data.address ? { address: data.address } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.email ? { email: data.email } : {}),
      ...(data.website ? { website: data.website } : {}),
      ...(data.hours ? { hours: data.hours } : {}),
      ...(data.socials && data.socials.length ? { socials: data.socials.map((s) => ({ platform: s.platform, url: s.url })) } : {}),
    },
    ...(data.rating || data.ratingCount
      ? { rating: { ...(data.rating ? { value: data.rating } : {}), ...(data.ratingCount ? { count: data.ratingCount } : {}) } }
      : {}),
    ...(offerings.length ? { offerings } : {}),
  }

  // Carry the Space's existing cover as the hero image (+ logo) so a re-apply keeps painting them.
  if (space.coverImageUrl || space.brandLogoUrl) {
    draft.media = {
      ...(space.coverImageUrl ? { heroPath: space.coverImageUrl } : {}),
      ...(space.brandLogoUrl ? { logoPath: space.brandLogoUrl } : {}),
    }
  }

  // Ledger: mark every PRESENT commercial fact human-verified so a re-apply publishes it (the owner
  // already made it live). Identity + prose are left ledger-free (hand-supplied → publishes).
  const ledger: ProvenanceLedger = {}
  if (data.address) ledger['contact.address'] = [humanFact()]
  if (data.phone) ledger['contact.phone'] = [humanFact()]
  if (data.email) ledger['contact.email'] = [humanFact()]
  if (data.hours) ledger['contact.hours'] = [humanFact()]
  if (data.rating || data.ratingCount) ledger.rating = [humanFact()]
  offerings.forEach((o, i) => {
    if (typeof o.price === 'number') ledger[`offerings[${i}].price`] = [humanFact()]
  })

  // First images: the cover leads (it is the Space's primary image), then the brand logo if distinct.
  const images = [space.coverImageUrl, space.brandLogoUrl]
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
    .filter((u, i, arr) => arr.indexOf(u) === i)

  return { draft, ledger, images }
}

export type AdoptResult = { ok: true; intakeId: string; created: boolean } | { ok: false; error: string }

/**
 * Adopt a hand-made Space into an editable master profile, IDEMPOTENTLY: if an intake already links the
 * Space (it was seeded, or already adopted), return that one (created:false). Else read the Space's own
 * content and store a derived, already-'applied' master profile bound to the Space (created:true). The
 * root Space (the platform host) is never adoptable. Fail-safe with a plain reason; never throws.
 */
export async function adoptSpaceAsMasterProfile(spaceId: string, operatorId: string): Promise<AdoptResult> {
  const existing = await getIntakeBySpaceId(spaceId)
  if (existing) return { ok: true, intakeId: existing.id, created: false }

  const space = await getSpaceById(spaceId)
  if (!space) return { ok: false, error: 'Space not found.' }
  if (space.type === 'root') return { ok: false, error: 'The platform host cannot have a master profile.' }
  if (!space.name?.trim()) return { ok: false, error: 'This Space has no name to build a profile from.' }

  const data = readProfileData(space.preferences)
  const { draft, ledger, images } = profileFromSpace(space, data)

  const inputs: IntakeInputs = {
    // A hand-made Space is a real, live business (not an unlisted demo), so a re-apply keeps it live.
    consent: { isDemo: false },
    ...(images.length ? { images, imagesFiledToLoom: images } : {}),
  }

  const intakeId = await createMasterProfile({ createdBy: operatorId, spaceId, inputs, draft, ledger })
  if (!intakeId) return { ok: false, error: 'Could not create the master profile.' }
  return { ok: true, intakeId, created: true }
}

// THE LEAD BEHIND A CREATE A SPACE DRAFT, the pure half (ADR-1933, LIVE-1967). Once step 3 has an address, every
// save sends the draft to the server (lib/create-space/draft-io.ts) and the address into the signup funnel. This module
// decides what goes with it: the persona the offer reads as, the lead score, the funnel payload, the builder step
// reached and the browser's zone. PURE and client-safe: nothing here reads a cookie, a header or the database.
//
// The score is the one in the plan: +10 email, +5 phone, +5 where, +10 offer, +5 own photo, +15 saved, +30 launched.
// 60 and over is a lead worth a person's call (the onboarding route, LIVE-1970). It is stored on the lead row's
// payload now and copied to contacts.meta.create_space.score by the funnel work.

import type { BuilderDraft, BuilderMove } from '@/lib/create-space/builder'
import { BUILDER_MOVES } from '@/lib/create-space/builder'

/** A resume token as the browser and the email link carry it (base64url, 8 to 64 chars). */
export const LEAD_TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/
export function isLeadToken(v: unknown): v is string {
  return typeof v === 'string' && LEAD_TOKEN_RE.test(v)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** The address a draft can be saved to, lowercased, or null. */
export function leadEmailOf(draft: Pick<BuilderDraft, 'email'>): string | null {
  const email = draft.email.trim().toLowerCase()
  return EMAIL_RE.test(email) && email.length <= 254 ? email : null
}

type LeadPersona = 'practitioner' | 'partner'

/** An offer that reads as a place other people use, rather than a practice. */
const VENUE_RE = /\b(venue|hall|rooms? (for|to) (hire|rent)|room hire|space (for|to) (hire|rent)|studio (for|to) (hire|rent)|rent(al)?s? out|co-?working|host(ing)? (events|gatherings|retreats) at|gallery space)\b/i

/** Practitioner by default; partner when the sentence is about a venue (the plan's one exception). */
export function personasFor(offer: string): LeadPersona[] {
  return VENUE_RE.test(offer) ? ['partner'] : ['practitioner']
}

interface LeadScoreFacts {
  /** The draft has been sent to the server at least once. */
  saved: boolean
  /** The visitor brought a picture of their own (a cover, a logo or a host photo). */
  ownPhoto: boolean
  /** The Space has been launched from this draft. */
  launched?: boolean
}

export function leadScore(draft: BuilderDraft, facts: LeadScoreFacts): number {
  let n = 0
  if (leadEmailOf(draft)) n += 10
  if (draft.phone.trim()) n += 5
  if (draft.where.trim()) n += 5
  if (draft.done.offer && draft.offer.trim()) n += 10
  if (facts.ownPhoto) n += 5
  if (facts.saved) n += 15
  if (facts.launched) n += 30
  return n
}

/** A lead at or past this line is routed to a person (LIVE-1970). */
export const LEAD_HOT_SCORE = 60

/** The 1-based builder step the draft has reached: the furthest done move plus one, at most 4. */
export function stepReached(draft: Pick<BuilderDraft, 'done'>): number {
  let n = 0
  BUILDER_MOVES.forEach((m: BuilderMove, i) => { if (draft.done[m]) n = i + 1 })
  return n
}

/** An IANA zone as the browser reports it (Area/City, at most two slashes, 64 chars). */
export function isZone(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 64 && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(v)
}

/** The browser's zone, or null where it cannot say. Client only. */
export function browserZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isZone(tz) ? tz : null
  } catch {
    return null
  }
}

/** What rides on the signup_leads row beside the address. Keys the operator list already reads (personas, location,
 *  sequence) plus the builder's own facts. No picture, no free text past the one-line offer. */
export function leadPayloadFor(draft: BuilderDraft, facts: LeadScoreFacts & { tz: string | null }): Record<string, string | number | string[] | null> {
  return {
    flow: 'create-a-space',
    sequence: 'create_space',
    personas: personasFor(draft.offer),
    kit: draft.kit,
    intents: [...draft.goals],
    handle: draft.slug.trim() || null,
    offer: draft.done.offer ? draft.offer.trim().slice(0, 160) : null,
    location: draft.where.trim() || null,
    phone: draft.phone.trim() || null,
    own_photo: facts.ownPhoto ? 1 : 0,
    step: stepReached(draft),
    tz: facts.tz,
    score: leadScore(draft, facts),
  }
}

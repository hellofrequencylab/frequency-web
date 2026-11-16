// The trust boundary for the Profile Creator's AI output: coerceExtraction() turns arbitrary model JSON (vision scan
// or Vera text assist) into a safe, fully-populated ExtractedContact, and coerceContactDetails() does the same for
// the rich `details` harvest. Pure, no I/O, fully unit-tested (./normalize.test.ts). Server-side: the browser's own
// helpers (tags, crop geometry) are in ./normalize.ts.
//
// Every reader here is a zod schema plus a mapper (PROG-E8C, the ADR-1287 pattern, lib/ai/schema.ts): the schema says
// what each raw field may be and what a wrong one reads as, the mapper builds the stored shape. Nothing walks the raw
// value by hand, and nothing here throws.

import { coerceCorners, coerceQuality, foundRegion } from '@/lib/events/normalize'
import { aliasedText, lenientList, looseEnum, noteList, rowsOrNone, textOrEmpty, unitBox, validateModelValue, z } from '@/lib/ai/schema'
import { dedupeTags } from './normalize'
import type {
  ExtractedContact,
  FaceBox,
  ContactSocials,
  ContactDetails,
  ContactPhone,
  ContactEmail,
  ContactLink,
  ContactOtherDetail,
  CardCorners,
  FieldConfidence,
} from './types'

/** The tag list as sent: anything that is not a string is dropped; not a list is no tags. */
const TAGS = lenientList(z.string()).catch(() => [])

/** Clamp a model-provided box into the unit square; null if degenerate/missing. */
export function clampBox(raw: unknown): FaceBox | null {
  const res = validateModelValue(raw, unitBox)
  return res.ok ? res.data : null
}

/** The handles printed on a card. `twitter` is the older key for `x`. Only the ones that were given are kept. */
const SOCIALS = z
  .object({ instagram: textOrEmpty(120), linkedin: textOrEmpty(200), x: aliasedText(120), twitter: aliasedText(120), other: textOrEmpty(200) })
  .transform((s) => {
    const out: ContactSocials = {}
    if (s.instagram) out.instagram = s.instagram
    if (s.linkedin) out.linkedin = s.linkedin
    const x = s.x ?? s.twitter ?? ''
    if (x) out.x = x
    if (s.other) out.other = s.other
    return out
  })
  .catch(() => ({}))

/** 'high' | 'low' field confidence, or undefined when absent/unknown. */
const CONFIDENCE = looseEnum(['high', 'low'] as const satisfies readonly FieldConfidence[])
  .optional()
  .catch(undefined)

const LINK_KINDS = ['website', 'booking', 'portfolio', 'other'] as const

/** The rich `details` harvest as sent. Each list is read row by row (a row that is not an object is dropped, a list
 *  that is not a list is empty) and each field has its own wrong-type reading. `phone` and `email` are the older
 *  keys for a row's `number` and `address`. */
const DETAILS_REPLY = z.object({
  phones: rowsOrNone(z.object({ label: textOrEmpty(40), number: aliasedText(40), phone: aliasedText(40), confidence: CONFIDENCE })),
  emails: rowsOrNone(z.object({ label: textOrEmpty(40), address: aliasedText(200), email: aliasedText(200), confidence: CONFIDENCE })),
  addresses: noteList(3, 240).catch(() => []),
  services: noteList(12, 120).catch(() => []),
  certifications: noteList(8, 120).catch(() => []),
  hours: textOrEmpty(200),
  links: rowsOrNone(z.object({ label: textOrEmpty(120), url: textOrEmpty(300), kind: looseEnum(LINK_KINDS).catch('other'), confidence: CONFIDENCE })),
  other: rowsOrNone(z.object({ label: textOrEmpty(80), value: textOrEmpty(240), confidence: CONFIDENCE })),
  confidence: CONFIDENCE,
})

/** Build the stored details from a parsed reply: drop the rows missing their required part, cap each list (phones 4,
 *  emails 4, links 8, other 12), and leave out every empty key. */
function toContactDetails(d: z.infer<typeof DETAILS_REPLY>): ContactDetails {
  const out: ContactDetails = {}

  // phones (<=4): number required; optional label/confidence.
  const phones = d.phones
    .flatMap((r): ContactPhone[] => {
      const number = r.number ?? r.phone ?? ''
      if (!number) return []
      const item: ContactPhone = { label: r.label, number }
      if (r.confidence) item.confidence = r.confidence
      return [item]
    })
    .slice(0, 4)
  if (phones.length) out.phones = phones

  // emails (<=4): address required; optional label/confidence.
  const emails = d.emails
    .flatMap((r): ContactEmail[] => {
      const address = (r.address ?? r.email ?? '').toLowerCase()
      if (!address) return []
      const item: ContactEmail = { label: r.label, address }
      if (r.confidence) item.confidence = r.confidence
      return [item]
    })
    .slice(0, 4)
  if (emails.length) out.emails = emails

  // addresses (<=3), services (<=12), certifications (<=8): plain strings.
  if (d.addresses.length) out.addresses = d.addresses
  if (d.services.length) out.services = d.services
  if (d.certifications.length) out.certifications = d.certifications

  // hours: a single free-text line ("Mon to Fri 9 to 5").
  if (d.hours) out.hours = d.hours

  // links (<=8): url required; the label falls back to the url; kind whitelisted.
  const links = d.links
    .filter((r) => r.url)
    .slice(0, 8)
    .map((r) => {
      const item: ContactLink = { label: r.label || r.url, url: r.url, kind: r.kind }
      if (r.confidence) item.confidence = r.confidence
      return item
    })
  if (links.length) out.links = links

  // other (<=12): label + value pairs.
  const other = d.other
    .filter((r) => r.label && r.value)
    .slice(0, 12)
    .map((r) => {
      const item: ContactOtherDetail = { label: r.label, value: r.value }
      if (r.confidence) item.confidence = r.confidence
      return item
    })
  if (other.length) out.other = other

  if (d.confidence) out.confidence = d.confidence

  return out
}

const CONTACT_DETAILS = DETAILS_REPLY.transform(toContactDetails)

/**
 * Validate + length-cap the rich `details` harvest from a card. Every nested
 * field is optional; we drop empty rows, whitelist enums (unknown -> 'other'),
 * and cap each array (phones 4, emails 4, addresses 3, services 12,
 * certifications 8, links 8, other 12). Returns {} when there is nothing worth
 * persisting (so the JSONB column default stays clean). Mirrors
 * lib/events/normalize.ts (coerceEventDetails).
 */
export function coerceContactDetails(raw: unknown): ContactDetails {
  const res = validateModelValue(raw, CONTACT_DETAILS)
  return res.ok ? res.data : {}
}

/** One entry per input image; what each entry holds is judged by the events corner reader. */
const CORNER_SETS = z.array(z.unknown())

/**
 * Coerce the per-image card corners: an array aligned to the input images where
 * entry i is the four corners of the card in image i, or null when that side's
 * corners are missing/unusable. Each quad is validated by the events
 * coerceCorners (all four points present and within 0..1, order preserved).
 */
export function coerceCardCorners(raw: unknown, maxImages = 6): (CardCorners | null)[] {
  const res = validateModelValue(raw, CORNER_SETS)
  if (!res.ok) return []
  return res.data.slice(0, maxImages).map((entry) => coerceCorners(entry))
}

/** The save_contact reply as sent (card scan or Vera's text assist). `name` and `note` are the older keys for
 *  `displayName` and `connectionNote`. Every field has its own wrong-type reading, so the reply as a whole only
 *  fails when it is not an object at all. */
const CONTACT_REPLY = z.object({
  displayName: aliasedText(120),
  name: aliasedText(120),
  email: textOrEmpty(200),
  phone: textOrEmpty(40),
  title: textOrEmpty(120),
  company: textOrEmpty(120),
  city: textOrEmpty(120),
  website: textOrEmpty(200),
  socials: SOCIALS,
  tags: TAGS,
  connectionNote: aliasedText(600),
  note: aliasedText(600),
  photo: foundRegion,
  logo: foundRegion,
  corners: z.unknown().optional(),
  quality: z.unknown().optional(),
  details: CONTACT_DETAILS.catch(() => ({})),
})

/** What a reply that is not an object at all reads as: every field at its empty reading. */
const NO_CONTACT = CONTACT_REPLY.parse({})

/** Arbitrary model JSON → a safe, fully-populated ExtractedContact. */
export function coerceExtraction(raw: unknown): ExtractedContact {
  const res = validateModelValue(raw, CONTACT_REPLY)
  const r = res.ok ? res.data : NO_CONTACT
  return {
    displayName: r.displayName ?? r.name ?? '',
    email: r.email.toLowerCase(),
    phone: r.phone,
    title: r.title,
    company: r.company,
    city: r.city,
    website: r.website,
    socials: r.socials,
    tags: dedupeTags(r.tags),
    connectionNote: r.connectionNote ?? r.note ?? '',
    photo: r.photo,
    logo: r.logo,
    corners: coerceCardCorners(r.corners),
    quality: coerceQuality(r.quality),
    details: r.details,
  }
}

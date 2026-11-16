// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the reply schema for the EXTRACT stage (PROG-E8C, the ADR-1287
// pattern, lib/ai/schema.ts). The save_business_profile tool input is untrusted. Before it reaches
// the grounding coercer (./coerce.ts) it is read through this schema, never cast.
//
// The schema only says what TYPE each part is: a part of the wrong type reads as absent and a list
// row that is not an object is dropped, so one stray number cannot sink the whole extraction.
// Whether a value is TRUE is still the grounding gate's call. Kept out of ./coerce.ts on purpose:
// that file has no runtime imports, and the probes that load it on its own rely on that.
// ─────────────────────────────────────────────────────────────────────────────

import { citedField, lenientList, validateModelValue, z } from '@/lib/ai/schema'
import type { RawExtraction } from './coerce'

const text = z.string().optional().catch(undefined)
const PLATFORM_LINKS = lenientList(z.object({ platform: text, url: text })).optional().catch(undefined)

const EXTRACTION_REPLY = z.object({
  name: citedField,
  brandName: citedField,
  type: text,
  tagline: citedField,
  category: citedField,
  about: citedField,
  story: citedField,
  contact: z
    .object({ address: citedField, phone: citedField, email: citedField, website: citedField, hours: citedField, socials: PLATFORM_LINKS })
    .optional()
    .catch(undefined),
  rating: z.object({ value: citedField, count: citedField }).optional().catch(undefined),
  offerings: lenientList(
    z.object({ title: citedField, blurb: citedField, price: citedField, priceModel: text, currency: text, durationMinutes: z.number().optional().catch(undefined) }),
  )
    .optional()
    .catch(undefined),
  faq: lenientList(z.object({ q: text, a: text, sourceUrl: text, snippet: text })).optional().catch(undefined),
  events: lenientList(z.object({ title: text, startsAt: text, endsAt: text, location: text, blurb: text, sourceUrl: text, snippet: text }))
    .optional()
    .catch(undefined),
  links: PLATFORM_LINKS,
})

/** Read a tool_use input into the raw extraction shape through the schema, or null when it is not an object at all
 *  (the caller then degrades exactly as it does for a failed call). PURE + total: never throws. */
export function readRawExtraction(raw: unknown): RawExtraction | null {
  const res = validateModelValue(raw, EXTRACTION_REPLY)
  return res.ok ? res.data : null
}

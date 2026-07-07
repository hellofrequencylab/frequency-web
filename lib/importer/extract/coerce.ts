// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the PURE extraction coercion + grounding layer (P1,
// docs/BUSINESS-IMPORTER.md §4.1). The model returns a raw, untrusted shape; this layer
// coerces it into a BusinessProfile draft AND builds the first-pass ProvenanceLedger,
// attaching to every field the sourceUrl + snippet the model cited.
//
// GROUNDING GATE (docs §4.1): a field whose cited snippet is NOT actually present in the
// harvested sources is DOWNGRADED from 'fact' to 'inferred' (the model cannot silently
// promote a guess to a fact by claiming a citation that does not exist). This is the first
// of the two verification gates; the adversarial refuter (verify/) is the second.
//
// PURE + framework-independent (no AI / Supabase). Unit-tested exhaustively: this is where
// "never trust the raw model shape" lives.
// ─────────────────────────────────────────────────────────────────────────────

import type { BusinessProfile, LedgerEntry, LedgerKind, ProvenanceLedger } from '../schema'
import type { HarvestedSource } from '../intake'

// ── The raw model shape (untrusted) ─────────────────────────────────────────────────

/** One field the model extracted, with the citation it claims. Every value is a string as the
 *  model emits it; the coercer parses/validates into the typed BusinessProfile field. */
export interface RawExtractedField {
  value?: string
  /** The source url the model says supports this value (must match a harvested source). */
  sourceUrl?: string
  /** The exact snippet from that source the model relied on. */
  snippet?: string
  /** The model's self-declared kind: fact (cited), inferred (deduced), generated (written). */
  kind?: string
  /** The model's 0..1 confidence. */
  confidence?: number
}

/** A raw offering the model extracted (with its own per-field citation for price). */
export interface RawOffering {
  title?: RawExtractedField
  blurb?: RawExtractedField
  price?: RawExtractedField
  priceModel?: string
  currency?: string
  durationMinutes?: number
}

/** The full untrusted shape the `save_business_profile` tool returns. Every field optional;
 *  nothing is trusted until coerced. */
export interface RawExtraction {
  name?: RawExtractedField
  brandName?: RawExtractedField
  type?: string
  tagline?: RawExtractedField
  category?: RawExtractedField
  about?: RawExtractedField
  story?: RawExtractedField
  contact?: {
    address?: RawExtractedField
    phone?: RawExtractedField
    email?: RawExtractedField
    website?: RawExtractedField
    hours?: RawExtractedField
    socials?: { platform?: string; url?: string }[]
  }
  rating?: { value?: RawExtractedField; count?: RawExtractedField }
  offerings?: RawOffering[]
  faq?: { q?: string; a?: string }[]
  events?: { title?: string; startsAt?: string; endsAt?: string; location?: string; blurb?: string }[]
  links?: { platform?: string; url?: string }[]
}

// ── Grounding helpers ────────────────────────────────────────────────────────────

/** Case/space-insensitive containment: is `snippet` actually present in ANY harvested source's
 *  text (or title)? The grounding check that a claimed citation is real. PURE. */
export function snippetIsGrounded(snippet: string | undefined, sources: HarvestedSource[]): boolean {
  const needle = normalizeForMatch(snippet)
  if (!needle) return false
  for (const s of sources) {
    const hay = `${normalizeForMatch(s.text)} ${normalizeForMatch(s.title)}`
    if (hay.includes(needle)) return true
  }
  return false
}

function normalizeForMatch(s: string | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clamp a confidence into 0..1; default to a modest 0.5 when absent/garbage. PURE. */
export function clampConfidence(c: number | undefined, fallback = 0.5): number {
  if (typeof c !== 'number' || !Number.isFinite(c)) return fallback
  return Math.min(1, Math.max(0, c))
}

/** Coerce the model's self-declared kind to a LedgerKind (default 'generated' — the most
 *  conservative: an unlabeled field is treated as AI-written, not a fact). PURE. */
export function coerceKind(raw: string | undefined): LedgerKind {
  if (raw === 'fact' || raw === 'inferred' || raw === 'generated') return raw
  return 'generated'
}

/**
 * Build a ledger entry for one extracted field, applying the GROUNDING GATE (docs §4.1): a field the
 * model labeled 'fact' stays a fact ONLY when its snippet is actually present in the harvested
 * sources. A matching sourceUrl is NOT sufficient (a known page url does not prove the specific claim
 * appears on it), so the snippet-containment check is REQUIRED for 'fact' regardless of the url. A
 * fact that fails is downgraded to 'inferred' and its confidence capped. This is the anti-laundering
 * gate: the model cannot promote a guess to a fact by citing a url without the supporting text. PURE.
 */
export function groundField(field: RawExtractedField, sources: HarvestedSource[]): LedgerEntry {
  let kind = coerceKind(field.kind)
  let confidence = clampConfidence(field.confidence)
  const snippet = (field.snippet ?? '').trim() || undefined
  const sourceUrl = (field.sourceUrl ?? '').trim() || undefined

  if (kind === 'fact' && !snippetIsGrounded(snippet, sources)) {
    // The model claimed a fact whose snippet is not in any source (a url match alone never clears).
    kind = 'inferred'
    confidence = Math.min(confidence, 0.4)
  }

  const entry: LedgerEntry = { kind, confidence }
  if (sourceUrl) entry.sourceUrl = sourceUrl
  if (snippet) entry.snippet = snippet
  return entry
}

// ── The coercer: raw model shape -> BusinessProfile draft + ledger ────────────────────

const KNOWN_TYPES = new Set(['business', 'nonprofit'])
const PRICE_MODELS = new Set(['fixed', 'from', 'free', 'contact'])

/** The output of extraction: the draft plus the first-pass ledger keyed by field path. */
export interface ExtractionResult {
  draft: BusinessProfile
  ledger: ProvenanceLedger
}

/**
 * Coerce a raw model extraction into a BusinessProfile draft + a first-pass ProvenanceLedger.
 * Every scalar field that carries a value gets a ledger entry at its path (e.g. 'contact.phone',
 * 'offerings[0].price'), grounded against the harvested sources. `nameFallback` (an operator hint)
 * seeds the name when the model returns none, since the materializer needs a name. PURE + total.
 */
export function coerceExtraction(
  raw: RawExtraction,
  sources: HarvestedSource[],
  nameFallback = '',
): ExtractionResult {
  const draft: BusinessProfile = { name: '', type: 'business' }
  const ledger: ProvenanceLedger = {}

  const put = (path: string, field: RawExtractedField | undefined): string | undefined => {
    const value = (field?.value ?? '').trim()
    if (!field || !value) return undefined
    ledger[path] = [groundField(field, sources)]
    return value
  }

  // Identity
  const name = put('name', raw.name) ?? nameFallback.trim()
  draft.name = name
  const brandName = put('brandName', raw.brandName)
  if (brandName) draft.brandName = brandName
  draft.type = KNOWN_TYPES.has(raw.type ?? '') ? (raw.type as 'business' | 'nonprofit') : 'business'
  const tagline = put('tagline', raw.tagline)
  if (tagline) draft.tagline = tagline
  const category = put('category', raw.category)
  if (category) draft.category = category
  const about = put('about', raw.about)
  if (about) draft.about = about
  const story = put('story', raw.story)
  if (story) draft.story = story

  // Contact
  const contact: NonNullable<BusinessProfile['contact']> = {}
  if (raw.contact) {
    const address = put('contact.address', raw.contact.address)
    if (address) contact.address = address
    const phone = put('contact.phone', raw.contact.phone)
    if (phone) contact.phone = phone
    const email = put('contact.email', raw.contact.email)
    if (email) contact.email = email
    const website = put('contact.website', raw.contact.website)
    if (website) contact.website = website
    const hours = put('contact.hours', raw.contact.hours)
    if (hours) contact.hours = hours
    const socials = coerceSocials(raw.contact.socials)
    if (socials.length) contact.socials = socials
  }
  if (Object.keys(contact).length) draft.contact = contact

  // Rating (a single logical commercial fact; ground the value)
  if (raw.rating) {
    const value = put('rating', raw.rating.value)
    const count = (raw.rating.count?.value ?? '').trim()
    if (value || count) {
      draft.rating = {}
      if (value) draft.rating.value = value
      if (count) draft.rating.count = count
    }
  }

  // Offerings (per-offering price is a commercial fact; ground it per index)
  const offerings = coerceOfferings(raw.offerings, sources, ledger)
  if (offerings.length) draft.offerings = offerings

  // FAQ (no per-field citation; light content)
  const faq = (raw.faq ?? [])
    .map((f) => ({ q: (f.q ?? '').trim(), a: (f.a ?? '').trim() }))
    .filter((f) => f.q)
  if (faq.length) draft.faq = faq

  // Events (dates validated downstream by the P0 mapper)
  const events = (raw.events ?? [])
    .map((e) => ({
      title: (e.title ?? '').trim(),
      startsAt: (e.startsAt ?? '').trim() || undefined,
      endsAt: (e.endsAt ?? '').trim() || undefined,
      location: (e.location ?? '').trim() || undefined,
      blurb: (e.blurb ?? '').trim() || undefined,
    }))
    .filter((e) => e.title)
  if (events.length) draft.events = events

  // Links
  const links = coerceSocials(raw.links)
  if (links.length) draft.links = links

  return { draft, ledger }
}

function coerceSocials(raw: { platform?: string; url?: string }[] | undefined): { platform: string; url: string }[] {
  const out: { platform: string; url: string }[] = []
  const seen = new Set<string>()
  for (const s of raw ?? []) {
    const platform = (s.platform ?? '').trim().toLowerCase()
    const url = (s.url ?? '').trim()
    if (!platform || !url) continue
    const key = `${platform}:${url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ platform, url })
  }
  return out
}

function coerceOfferings(
  raw: RawOffering[] | undefined,
  sources: HarvestedSource[],
  ledger: ProvenanceLedger,
): NonNullable<BusinessProfile['offerings']> {
  const out: NonNullable<BusinessProfile['offerings']> = []
  for (const o of raw ?? []) {
    const title = (o.title?.value ?? '').trim()
    if (!title) continue
    const idx = out.length
    const row: NonNullable<BusinessProfile['offerings']>[number] = { title }
    // Title citation (informational; not a commercial fact).
    if (o.title) ledger[`offerings[${idx}].title`] = [groundField(o.title, sources)]
    const blurb = (o.blurb?.value ?? '').trim()
    if (blurb) {
      row.blurb = blurb
      if (o.blurb) ledger[`offerings[${idx}].blurb`] = [groundField(o.blurb, sources)]
    }
    // Price is a COMMERCIAL FACT — ground it and key its ledger at offerings[i].price.
    const priceStr = (o.price?.value ?? '').trim()
    if (priceStr) {
      const parsed = parsePrice(priceStr)
      if (parsed !== null) {
        row.price = parsed
        if (o.price) ledger[`offerings[${idx}].price`] = [groundField(o.price, sources)]
      }
    }
    const currency = (o.currency ?? '').trim().toUpperCase()
    if (/^[A-Z]{3}$/.test(currency)) row.currency = currency
    if (o.priceModel && PRICE_MODELS.has(o.priceModel)) {
      row.priceModel = o.priceModel as 'fixed' | 'from' | 'free' | 'contact'
    }
    if (typeof o.durationMinutes === 'number' && Number.isFinite(o.durationMinutes) && o.durationMinutes > 0) {
      row.durationMinutes = Math.round(o.durationMinutes)
    }
    out.push(row)
  }
  return out
}

/** Parse a price string ("$45", "45.00", "From 20") to a major-unit number, or null. PURE. */
export function parsePrice(raw: string): number | null {
  const m = raw.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 ? n : null
}

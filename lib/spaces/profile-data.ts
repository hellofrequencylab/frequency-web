// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL SPACE PROFILE DATA — the ONE source of truth for a Space's business info
// (owner directive, 2026-07: "all page content is dynamic; change the business
// address and it changes everywhere, no matter how it's displayed").
//
// Business + editorial facts live ONCE on `spaces.preferences.profileData`, not
// copied into each block's Puck props. Every block READS this off the shared
// `metadata.space.profile` seam (lib/spaces/content-data.ts injects it, the same
// way the live blocks read counts/events), so the operator edits the address (or
// hours, or story) in ONE Business Info form and every surface that shows it —
// the Contact card, the Business strip, a Spotlight — updates at once.
//
// BACKWARD COMPATIBLE: every field is optional and fail-safe. A block still
// accepts its own inline prop and falls back to it when the central field is
// empty (mergeField), so nothing regresses before the operator fills the form.
//
// PURE + total: no server/Next imports, tolerant of malformed blobs.
// ─────────────────────────────────────────────────────────────────────────────

/** One social / business-presence link (branded chip). `platform` keys the icon + label. */
export interface SpaceSocialLink {
  platform: string
  url: string
}

/** How a service is priced. `fixed` = one set price; `from` = a starting price ("from $80"); `free`
 *  = no charge; `contact` = price on request. */
export type ServicePriceModel = 'fixed' | 'from' | 'free' | 'contact'
/** A subscription cadence for a recurring service (a one-off charge is `once`). */
export type ServiceRecurring = 'once' | 'weekly' | 'monthly'
/** Whether a service shows publicly. `listed` (default) appears on the space storefront; `private`
 *  is reachable only by direct link and never renders publicly. */
export type ServiceVisibility = 'private' | 'listed'

const PRICE_MODELS: readonly ServicePriceModel[] = ['fixed', 'from', 'free', 'contact']
const RECURRING: readonly ServiceRecurring[] = ['once', 'weekly', 'monthly']
const VISIBILITY: readonly ServiceVisibility[] = ['private', 'listed']

/** One service / offering the Space provides (the single-source services catalog, doubling as the
 *  storefront's store items). `title` is required; everything else is OPTIONAL + fail-safe so a legacy
 *  `{ title, blurb }` row still parses. Prices are stored in MAJOR currency units (dollars), never cents. */
export interface SpaceOffering {
  title: string
  blurb?: string
  /** Headline price in major units (e.g. 120 = $120). Meaning depends on `priceModel`. */
  price?: number
  /** ISO 4217 code (default 'USD'). */
  currency?: string
  /** How to read `price` (fixed / from / free / contact). Absent = a plain fixed price. */
  priceModel?: ServicePriceModel
  /** Session length in minutes. */
  durationMinutes?: number
  /** Upfront amount (major units) taken to book. */
  deposit?: number
  /** Subscription cadence for a recurring service. */
  recurring?: ServiceRecurring
  /** Number of sessions in a multi-session package. */
  packageCount?: number
  /** Pay-what-you-can floor (major units). */
  slidingScaleMin?: number
  /** Pay-what-you-can ceiling (major units). */
  slidingScaleMax?: number
  /** Public visibility (default 'listed'; a missing value is treated as listed). */
  visibility?: ServiceVisibility
}

/** The central, single-source Space profile data. All optional + fail-safe. Business facts first,
 *  then the editorial story. Offerings / callout / section copy join here in a later phase. */
export interface SpaceProfileData {
  /** Street address (also powers the map link on the Contact card). */
  address?: string
  /** Opening hours, free text (one per line). */
  hours?: string
  /** Public phone number. */
  phone?: string
  /** Public contact email. */
  email?: string
  /** Primary website URL. */
  website?: string
  /** Social / business-presence links (LinkedIn, Facebook, Instagram, Yelp, Google, ...). */
  socials?: SpaceSocialLink[]
  /** Operator-entered star rating, e.g. "4.8" (Yelp/Google style). Never invented. */
  rating?: string
  /** The rating's review count label, e.g. "126 reviews". */
  ratingCount?: string
  /** The About / story body (one source for the About card + anywhere the story shows). */
  about?: string
  /** The services / offerings catalog (one source for the Offerings grid + anywhere services show). */
  offerings?: SpaceOffering[]
}

const KNOWN_PLATFORMS = new Set([
  'website',
  'linkedin',
  'facebook',
  'instagram',
  'x',
  'youtube',
  'tiktok',
  'yelp',
  'google',
])

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

/** Coerce to a finite, non-negative number (accepts a numeric string), else undefined. Fail-safe:
 *  a negative, NaN, or unparseable value is dropped. */
function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Like `num`, rounded to a whole number (for counts + minutes). */
function intNum(v: unknown): number | undefined {
  const n = num(v)
  return n === undefined ? undefined : Math.round(n)
}

/** Keep `v` only if it is one of `allowed`, else undefined (an unknown enum is dropped). */
function enumOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
}

/** A valid ISO-4217-ish 3-letter code (uppercased), else undefined. */
function currencyCode(v: unknown): string | undefined {
  const s = str(v)?.toUpperCase()
  return s && /^[A-Z]{3}$/.test(s) ? s : undefined
}

/** Read the central profile data off a preferences blob. FAIL-SAFE: an unknown / malformed shape
 *  yields an empty object, so a caller renders with nothing rather than throwing. Pure + total. */
export function readProfileData(preferences: unknown): SpaceProfileData {
  const prefs = preferences && typeof preferences === 'object' ? (preferences as Record<string, unknown>) : {}
  const raw = prefs.profileData
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const p = raw as Record<string, unknown>
  const socialsRaw = Array.isArray(p.socials) ? (p.socials as unknown[]) : []
  const socials: SpaceSocialLink[] = socialsRaw
    .map((s) => {
      const row = s && typeof s === 'object' ? (s as Record<string, unknown>) : {}
      const platform = str(row.platform)?.toLowerCase()
      const url = str(row.url)
      return platform && url && KNOWN_PLATFORMS.has(platform) ? { platform, url } : null
    })
    .filter((s): s is SpaceSocialLink => s !== null)
  const offeringsRaw = Array.isArray(p.offerings) ? (p.offerings as unknown[]) : []
  const offerings: SpaceOffering[] = offeringsRaw
    .map((o) => {
      const row = o && typeof o === 'object' ? (o as Record<string, unknown>) : {}
      const title = str(row.title)
      // A row needs at least a title to be a real service; a blurb / price alone is dropped.
      if (!title) return null
      const out: SpaceOffering = { title }
      const blurb = str(row.blurb)
      if (blurb) out.blurb = blurb
      // Pricing + visibility fields, all coerced fail-safe (numbers clamped, unknown enums dropped).
      const price = num(row.price)
      if (price !== undefined) out.price = price
      const currency = currencyCode(row.currency)
      if (currency) out.currency = currency
      const priceModel = enumOf(row.priceModel, PRICE_MODELS)
      if (priceModel) out.priceModel = priceModel
      const durationMinutes = intNum(row.durationMinutes)
      if (durationMinutes !== undefined) out.durationMinutes = durationMinutes
      const deposit = num(row.deposit)
      if (deposit !== undefined) out.deposit = deposit
      const recurring = enumOf(row.recurring, RECURRING)
      if (recurring) out.recurring = recurring
      const packageCount = intNum(row.packageCount)
      if (packageCount !== undefined) out.packageCount = packageCount
      const slidingScaleMin = num(row.slidingScaleMin)
      if (slidingScaleMin !== undefined) out.slidingScaleMin = slidingScaleMin
      const slidingScaleMax = num(row.slidingScaleMax)
      if (slidingScaleMax !== undefined) out.slidingScaleMax = slidingScaleMax
      const visibility = enumOf(row.visibility, VISIBILITY)
      if (visibility) out.visibility = visibility
      return out
    })
    .filter((o): o is SpaceOffering => o !== null)
  const out: SpaceProfileData = {}
  const address = str(p.address)
  const hours = str(p.hours)
  const phone = str(p.phone)
  const email = str(p.email)
  const website = str(p.website)
  const rating = str(p.rating)
  const ratingCount = str(p.ratingCount)
  const about = str(p.about)
  if (address) out.address = address
  if (hours) out.hours = hours
  if (phone) out.phone = phone
  if (email) out.email = email
  if (website) out.website = website
  if (socials.length > 0) out.socials = socials
  if (rating) out.rating = rating
  if (ratingCount) out.ratingCount = ratingCount
  if (about) out.about = about
  if (offerings.length > 0) out.offerings = offerings
  return out
}

/** The fields a Business Info form can submit (the writable central data). Same shape as the read
 *  model minus derivations. A blank string clears the field. */
export type ProfileDataPatch = SpaceProfileData

/** Immutably merge a patch into the preferences' profileData, dropping empties so the stored blob
 *  never accumulates blank keys. Pure: returns a NEW preferences object, input untouched. Unknown
 *  patch keys are ignored (only the known fields survive the readProfileData round-trip). */
export function withProfileData(preferences: unknown, patch: ProfileDataPatch): Record<string, unknown> {
  const prefs = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? { ...(preferences as Record<string, unknown>) }
    : {}
  // Merge over the current data, then normalize through readProfileData so only valid, non-empty
  // fields persist (a cleared field drops out entirely).
  const merged = { ...readProfileData(prefs), ...patch }
  const normalized = readProfileData({ profileData: merged })
  if (Object.keys(normalized).length === 0) {
    delete prefs.profileData
  } else {
    prefs.profileData = normalized
  }
  return prefs
}

/** Pick the effective value for a field: the CENTRAL profile value wins (single source of truth — edit
 *  once, changes everywhere), falling back to the block's own inline prop ONLY when the central field
 *  is empty (a legacy stored doc whose operator has not filled the Business Info form yet). Once the
 *  central field is set it overrides every block, which is the whole point of the single source. */
export function mergeField(blockProp: string | undefined, central: string | undefined): string | undefined {
  const c = central?.trim()
  if (c) return c
  const p = blockProp?.trim()
  return p ? p : undefined
}

// ── Service pricing display (PURE) ───────────────────────────────────────────────────────────────────

/** Format a major-unit amount as a price label (e.g. 120 -> "$120", 79.5 -> "$79.50"). Whole amounts
 *  drop the cents. Falls back to a plain "$" if the currency code is unknown. PURE. */
function money(amount: number, currency?: string): string {
  const code = currencyCode(currency) ?? 'USD'
  const whole = Number.isInteger(amount)
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `$${whole ? amount : amount.toFixed(2)}`
  }
}

/** The recurring-cadence suffix on a price ("/wk", "/mo", or "" for a one-off). */
function recurringSuffix(recurring: ServiceRecurring | undefined): string {
  if (recurring === 'weekly') return '/wk'
  if (recurring === 'monthly') return '/mo'
  return ''
}

/**
 * The headline price label for a service, or null when there is no pricing signal at all (so a caller
 * can simply omit the price line). Examples: "$120", "from $80", "$60/mo", "$40-$80 sliding scale",
 * "Free", "Contact for pricing". No em dashes (CONTENT-VOICE §10). PURE.
 */
export function formatServicePrice(service: SpaceOffering): string | null {
  if (service.priceModel === 'free') return 'Free'
  if (service.priceModel === 'contact') return 'Contact for pricing'
  // A sliding-scale range wins the headline (pay what you can within the band).
  if (service.slidingScaleMin !== undefined && service.slidingScaleMax !== undefined) {
    return `${money(service.slidingScaleMin, service.currency)}-${money(service.slidingScaleMax, service.currency)} sliding scale`
  }
  if (service.price === undefined) return null
  const prefix = service.priceModel === 'from' ? 'from ' : ''
  return `${prefix}${money(service.price, service.currency)}${recurringSuffix(service.recurring)}`
}

/** A deposit label ("$40 deposit to book"), or null when there is no deposit. PURE. */
export function formatServiceDeposit(service: SpaceOffering): string | null {
  if (service.deposit === undefined || service.deposit <= 0) return null
  return `${money(service.deposit, service.currency)} deposit to book`
}

/** A plain duration label ("45 min", "1 hr", "1 hr 30 min"), or null when unset / non-positive. PURE. */
export function formatServiceDuration(minutes: number | undefined): string | null {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

/** A package label ("6-session package"), or null when there is no multi-session package. PURE. */
export function formatServicePackage(service: SpaceOffering): string | null {
  if (service.packageCount === undefined || service.packageCount <= 1) return null
  return `${service.packageCount}-session package`
}

/** Whether a service should render on the PUBLIC storefront (listed / unset = yes, private = no). PURE. */
export function isServiceListed(service: SpaceOffering): boolean {
  return service.visibility !== 'private'
}

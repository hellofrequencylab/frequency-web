// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the PURE mapping layer (P0, docs/BUSINESS-IMPORTER.md §5).
//
// Turns a BusinessProfile draft into the exact write PAYLOADS the materializer seeds:
//   • a SpaceProfileData patch (contact / hours / socials / about / offerings / rating),
//   • an EntityLayout jsonb (rows + per-block content bags) for spaces.preferences.profileLayout,
//   • the function-record payloads (availability windows, faq rows, event rows),
//   • the resolved accent + the identity fields (name / slug / tagline / brand).
//
// This layer is PURE + framework-independent (no React / Next / Supabase). It is the
// deterministic core of the materializer, so the whole BusinessProfile -> jsonb/payload
// map is unit-testable with ZERO DB and ZERO AI. The seeding layer (materialize.ts) just
// runs these payloads through the real stores / admin client, bound to the target space_id.
//
// The block content-bag KEYS emitted here match the CURRENT exported shapes in
// lib/entity-blocks/block-content.ts (photoHero: eyebrow/title/subtitle/image/alt/button*;
// about/story: eyebrow/title/body; links: items[{label,url}]). Those files are owned by a
// concurrent editor overhaul and are READ-ONLY to the importer; see the COUPLING RISK note
// in the PR. We emit only CORE content keys; new optional style/margin/font fields are out
// of scope.
// ─────────────────────────────────────────────────────────────────────────────

import { isSafeSlug } from '@/lib/theme/validate'
import { isValidAccent } from '@/lib/spaces/accent'
import type { SpaceProfileData, SpaceOffering, SpaceSocialLink } from '@/lib/spaces/profile-data'
import type { EntityLayout, RowDef } from '@/lib/entity-blocks/layout'
import type {
  BusinessProfile,
  AvailabilityWindowInput,
  ProfileSocial,
} from './schema'

// ── Slug ──────────────────────────────────────────────────────────────────────

const SLUG_MAX = 40

/** Derive a safe slug from a business name: lowercase, hyphenate, strip to [a-z0-9-], bound.
 *  Pure + total; returns '' when nothing usable survives (the caller then fails cleanly). */
export function slugifyName(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '')
  return s
}

/** The slug to seed: an explicit valid slug wins, else derive from the name. Returns '' when
 *  neither yields a safe slug (a caller must then reject or append a suffix). Pure. */
export function resolveSlug(profile: BusinessProfile): string {
  const explicit = (profile.slug ?? '').trim().toLowerCase()
  if (explicit && isSafeSlug(explicit)) return explicit
  const derived = slugifyName(profile.name ?? '')
  return derived && isSafeSlug(derived) ? derived : ''
}

// ── Accent ──────────────────────────────────────────────────────────────────────

/** The brand accent to store, or null when the draft's accent is not a valid token/hex.
 *  A `#RGB` or bare hex is normalized to `#rrggbb` before validation. Pure. */
export function resolveAccent(profile: BusinessProfile): string | null {
  const raw = (profile.accent ?? '').trim()
  if (!raw) return null
  // Normalize a bare 6-hex ("aabbcc") or a 3-hex ("abc") to `#rrggbb`.
  let candidate = raw
  if (/^[0-9a-fA-F]{6}$/.test(raw)) candidate = `#${raw}`
  else if (/^#?[0-9a-fA-F]{3}$/.test(raw)) {
    const h = raw.replace('#', '')
    candidate = `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
  }
  return isValidAccent(candidate) ? candidate : null
}

// ── Identity ──────────────────────────────────────────────────────────────────────

/** The identity columns a new/updated space row carries. `type` is validated to the two
 *  designators; anything else folds to 'business'. Pure. */
export interface SpaceIdentity {
  slug: string
  name: string
  type: 'business' | 'nonprofit'
  brandName: string
  tagline: string | null
  brandAccent: string | null
  about: string | null
  brandLogoUrl: string | null
  coverImageUrl: string | null
}

/** Whether a media path is a ready-to-store URL (a full http(s) URL). A bare storage path is
 *  NOT ready (it must be turned into a public URL by the seeding layer after upload). Pure. */
export function isReadyMediaUrl(path: string | undefined): boolean {
  return typeof path === 'string' && /^https?:\/\//i.test(path.trim())
}

/** Build the identity columns from a draft + the resolved slug/accent. Media paths that are
 *  already public URLs are used as-is; bare paths are left for the seeding layer to upload.
 *  Pure. */
export function mapIdentity(
  profile: BusinessProfile,
  resolved: { slug: string; accent: string | null },
): SpaceIdentity {
  const name = (profile.name ?? '').trim()
  const type: 'business' | 'nonprofit' = profile.type === 'nonprofit' ? 'nonprofit' : 'business'
  const brandName = (profile.brandName ?? '').trim() || name
  const tagline = (profile.tagline ?? '').trim() || null
  const about = (profile.about ?? '').trim() || null
  const logo = profile.media?.logoPath
  const hero = profile.media?.heroPath
  return {
    slug: resolved.slug,
    name,
    type,
    brandName,
    tagline,
    brandAccent: resolved.accent,
    about,
    brandLogoUrl: isReadyMediaUrl(logo) ? logo!.trim() : null,
    coverImageUrl: isReadyMediaUrl(hero) ? hero!.trim() : null,
  }
}

// ── Profile data (contact / hours / socials / offerings / rating / about) ────────────

const KNOWN_SOCIAL_PLATFORMS = new Set([
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

/** Map the draft's socials + links to SpaceSocialLink rows, keeping only known platforms with a
 *  url (the profile-data reader drops unknown platforms, so we pre-filter). Pure. */
function mapSocials(socials: ProfileSocial[] | undefined): SpaceSocialLink[] {
  const out: SpaceSocialLink[] = []
  const seen = new Set<string>()
  for (const s of socials ?? []) {
    const platform = (s.platform ?? '').trim().toLowerCase()
    const url = (s.url ?? '').trim()
    if (!platform || !url || !KNOWN_SOCIAL_PLATFORMS.has(platform)) continue
    const key = `${platform}:${url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ platform, url })
  }
  return out
}

/** Map draft offerings to SpaceOffering rows (major-unit prices, enum-validated priceModel). A
 *  row needs a title to survive. Pure. */
function mapOfferings(profile: BusinessProfile): SpaceOffering[] {
  const out: SpaceOffering[] = []
  for (const o of profile.offerings ?? []) {
    const title = (o.title ?? '').trim()
    if (!title) continue
    const row: SpaceOffering = { title }
    const blurb = (o.blurb ?? '').trim()
    if (blurb) row.blurb = blurb
    if (typeof o.price === 'number' && Number.isFinite(o.price) && o.price >= 0) row.price = o.price
    const currency = (o.currency ?? '').trim().toUpperCase()
    if (/^[A-Z]{3}$/.test(currency)) row.currency = currency
    if (o.priceModel && ['fixed', 'from', 'free', 'contact'].includes(o.priceModel)) {
      row.priceModel = o.priceModel
    }
    if (
      typeof o.durationMinutes === 'number' &&
      Number.isFinite(o.durationMinutes) &&
      o.durationMinutes > 0
    ) {
      row.durationMinutes = Math.round(o.durationMinutes)
    }
    out.push(row)
  }
  return out
}

/**
 * The SpaceProfileData patch (the single source of truth for business facts). Everything the
 * `contact`, `offerings`, and `about` blocks read off `metadata.space.profile`. Commercial facts
 * (address/phone/email/hours/rating/offering prices) are included only when `policy.commercial`
 * clears them; P0 passes `'allow'` for a hand-authored draft, P1 passes `'gate'` with a ledger.
 * Pure.
 */
export function mapProfileData(
  profile: BusinessProfile,
  policy: { commercial: 'allow' | 'withhold' } = { commercial: 'allow' },
): SpaceProfileData {
  const out: SpaceProfileData = {}
  const contact = profile.contact
  const allowCommercial = policy.commercial === 'allow'

  if (contact) {
    if (allowCommercial && contact.address?.trim()) out.address = contact.address.trim()
    if (allowCommercial && contact.phone?.trim()) out.phone = contact.phone.trim()
    if (allowCommercial && contact.email?.trim()) out.email = contact.email.trim()
    if (allowCommercial && contact.hours?.trim()) out.hours = contact.hours.trim()
    if (contact.website?.trim()) out.website = contact.website.trim()
    const socials = mapSocials(contact.socials)
    if (socials.length) out.socials = socials
  }

  if (profile.about?.trim()) out.about = profile.about.trim()

  const offerings = mapOfferings(profile)
  if (offerings.length) {
    // Withhold PRICE (a commercial fact) when gated; keep the offering itself (title/blurb).
    out.offerings = allowCommercial
      ? offerings
      : offerings.map((o) => {
          const rest = { ...o }
          delete rest.price
          return rest
        })
  }

  if (allowCommercial && profile.rating) {
    const value = (profile.rating.value ?? '').trim()
    const count = (profile.rating.count ?? '').trim()
    if (value) out.rating = value
    if (count) out.ratingCount = count
  }

  return out
}

// ── Availability windows ──────────────────────────────────────────────────────────

/** Map draft availability to the AvailabilityWindow input shape the booking store validates.
 *  Invalid windows are dropped by the store's normalizeWindow; we forward the raw shape. Pure. */
export function mapAvailability(profile: BusinessProfile): AvailabilityWindowInput[] {
  return (profile.availability ?? []).filter(
    (w): w is AvailabilityWindowInput => !!w && typeof w.weekday === 'number',
  )
}

// ── FAQ rows ──────────────────────────────────────────────────────────────────────

/** One space_faqs insert payload (space_id is stamped by the seeding layer). */
export interface FaqRow {
  question: string
  answer: string
  position: number
}

/** Map draft FAQ to space_faqs rows in order. A row needs a question. Pure. */
export function mapFaqs(profile: BusinessProfile): FaqRow[] {
  const out: FaqRow[] = []
  for (const f of profile.faq ?? []) {
    const question = (f.q ?? '').trim()
    if (!question) continue
    out.push({ question, answer: (f.a ?? '').trim(), position: out.length })
  }
  return out
}

// ── Event rows ──────────────────────────────────────────────────────────────────────

/** One events insert payload (space_id / host_id / scope_id / slug stamped by the seeding
 *  layer; a standalone space event self-references host as scope, see materialize.ts). */
export interface EventRow {
  title: string
  description: string | null
  location: string | null
  startsAt: string
  endsAt: string | null
}

/** Map draft events to event-row payloads. A row needs a title and a start instant. Pure. */
export function mapEvents(profile: BusinessProfile): EventRow[] {
  const out: EventRow[] = []
  for (const e of profile.events ?? []) {
    const title = (e.title ?? '').trim()
    const starts = (e.startsAt ?? '').trim()
    if (!title || !starts) continue
    const d = new Date(starts)
    if (Number.isNaN(d.getTime())) continue
    const endRaw = (e.endsAt ?? '').trim()
    const end = endRaw && !Number.isNaN(new Date(endRaw).getTime()) ? new Date(endRaw).toISOString() : null
    out.push({
      title,
      description: (e.blurb ?? '').trim() || null,
      location: (e.location ?? '').trim() || null,
      startsAt: d.toISOString(),
      endsAt: end,
    })
  }
  return out
}

// ── Layout (EntityLayout jsonb: rows + per-block content bags) ────────────────────────

/** The ordered space block ids the composer will place, driven by what the draft actually has.
 *  A `layoutHint` (ordered block ids) overrides the default composition when present. */
const DEFAULT_ORDER: readonly string[] = [
  'photoHero',
  'about',
  'story',
  'offerings',
  'booking',
  'events',
  'team',
  'links',
  'reviews',
  'faq',
  'contact',
]

/** Whether a block has content to show for this draft, so the composer only places blocks that
 *  will render something. Pure. */
function blockHasContent(id: string, profile: BusinessProfile): boolean {
  switch (id) {
    case 'photoHero':
      return true // always the opener (headline from name/tagline, optional hero photo)
    case 'about':
      return !!(profile.about?.trim())
    case 'story':
      return !!(profile.story?.trim())
    case 'offerings':
      return (profile.offerings ?? []).some((o) => o.title?.trim())
    case 'booking':
      return (profile.availability ?? []).length > 0
    case 'events':
      return (profile.events ?? []).some((e) => e.title?.trim() && e.startsAt?.trim())
    case 'team':
      return (profile.team ?? []).some((t) => t.name?.trim())
    case 'links':
      return (profile.links ?? []).some((l) => l.url?.trim())
    case 'reviews':
      return !!(profile.rating?.value?.trim()) || (profile.reviews ?? []).some((r) => r.text?.trim())
    case 'faq':
      return (profile.faq ?? []).some((f) => f.q?.trim())
    case 'contact':
      return !!(
        profile.contact?.address?.trim() ||
        profile.contact?.phone?.trim() ||
        profile.contact?.email?.trim() ||
        profile.contact?.hours?.trim() ||
        (profile.contact?.socials ?? []).length
      )
    default:
      return false
  }
}

/** The ordered block ids to place: the `layoutHint` (filtered to blocks with content) if given,
 *  else the default order filtered to blocks with content. Pure. */
export function composeBlockOrder(profile: BusinessProfile): string[] {
  const source = profile.layoutHint && profile.layoutHint.length ? profile.layoutHint : DEFAULT_ORDER
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of source) {
    if (seen.has(id)) continue
    if (!DEFAULT_ORDER.includes(id)) continue // only known space blocks the composer manages
    if (!blockHasContent(id, profile)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Build the per-block content bags (ADR-528) keyed by block id. Emits ONLY the CORE content
 *  keys each block's schema declares (see lib/entity-blocks/block-content.ts). Pure. */
export function mapBlockContent(profile: BusinessProfile): Record<string, Record<string, unknown>> {
  const content: Record<string, Record<string, unknown>> = {}

  // PhotoHero: the bold opener. Headline from tagline (falls back to name), photo from hero media.
  const heroTitle = (profile.tagline ?? '').trim() || (profile.name ?? '').trim()
  const hero: Record<string, unknown> = { title: heroTitle }
  if ((profile.category ?? '').trim()) hero.eyebrow = profile.category!.trim()
  if ((profile.about ?? '').trim()) hero.subtitle = profile.about!.trim().slice(0, 300)
  if (isReadyMediaUrl(profile.media?.heroPath)) hero.image = profile.media!.heroPath!.trim()
  // No auto CTA button (leave the button off so we never emit a dead link).
  hero.buttonOn = false
  content.photoHero = hero

  // About block body (the identity prose; the block renders this over profileData.about).
  if ((profile.about ?? '').trim()) {
    content.about = { body: profile.about!.trim() }
  }

  // Story block body (the longer narrative).
  if ((profile.story ?? '').trim()) {
    content.story = { body: profile.story!.trim() }
  }

  // Links block: the bio-link list (items: [{ label, url }]).
  const linkItems = (profile.links ?? [])
    .map((l) => ({ label: (l.platform ?? '').trim() || (l.url ?? '').trim(), url: (l.url ?? '').trim() }))
    .filter((l) => l.url)
  if (linkItems.length) content.links = { items: linkItems }

  return content
}

/**
 * The full EntityLayout jsonb for spaces.preferences.profileLayout: freeform rows (one 1-column
 * row per placed block, the single-column space default) + the per-block content bags. The
 * seeding layer runs this through `sanitizeEntityLayout(layout, 'space')` before persist, which
 * drops any block the registry does not support and re-validates the content bags. Pure.
 */
export function composeLayout(profile: BusinessProfile): EntityLayout {
  const order = composeBlockOrder(profile)
  const rows: RowDef[] = order.map((id, i) => ({ id: `r${i}`, columns: 1, cells: [[id]] }))
  const content = mapBlockContent(profile)
  // Keep only content bags for blocks actually placed (avoid orphan content for a hidden block).
  const placed = new Set(order)
  const scopedContent: Record<string, Record<string, unknown>> = {}
  for (const [id, bag] of Object.entries(content)) {
    if (placed.has(id)) scopedContent[id] = bag
  }
  const layout: EntityLayout = { rows }
  if (Object.keys(scopedContent).length) layout.content = scopedContent
  return layout
}

// ── The full materialization plan (everything the seeding layer needs) ─────────────────

/** The complete, PURE plan the seeding layer executes. Every field is a payload bound to no
 *  space yet (the seeding layer stamps space_id / host_id). Nothing here touches IO. */
export interface MaterializationPlan {
  identity: SpaceIdentity
  profileData: SpaceProfileData
  layout: EntityLayout
  availability: AvailabilityWindowInput[]
  faqs: FaqRow[]
  events: EventRow[]
}

/** Build the full plan from a draft. `policy.commercial` gates commercial facts (P0: 'allow').
 *  Returns null when the draft has no usable name/slug (the caller then fails cleanly). Pure. */
export function buildPlan(
  profile: BusinessProfile,
  policy: { commercial: 'allow' | 'withhold' } = { commercial: 'allow' },
): MaterializationPlan | null {
  const name = (profile.name ?? '').trim()
  if (!name) return null
  const slug = resolveSlug(profile)
  if (!slug) return null
  const accent = resolveAccent(profile)
  return {
    identity: mapIdentity(profile, { slug, accent }),
    profileData: mapProfileData(profile, policy),
    layout: composeLayout(profile),
    availability: mapAvailability(profile),
    faqs: mapFaqs(profile),
    events: mapEvents(profile),
  }
}

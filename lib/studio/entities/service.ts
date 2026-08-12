// ─────────────────────────────────────────────────────────────────────────────
// THE SERVICE ENTITY MANIFEST (docs/STUDIO.md, ADR-597 · docs/SHOP-MARKETPLACE-PLAN.md, ADR-596).
//
// ONE thing a Space DOES for someone: a session, a class, a job. Unlike a product it is a slot on
// a calendar, so it carries a duration, a booking calendar, and the policy that protects the
// no-show. And unlike a product it does not always quote a number: a 'contact' service is the one
// sanctioned no-checkout path on the whole commerce spine (ADR-596 §3/§7), where the buyer sends
// an enquiry and the Space replies.
//
// PERSISTENCE: a `commerce_products` row with product_kind 'service', plus the service-specific
// config under `metadata.service` (`ServiceConfig`, lib/commerce/types.ts). That is the path the
// live booking + enquiry actions read (app/(main)/market/service-actions.ts), so it is what this
// manifest mirrors. The older `SpaceOffering` blob in a Space's preferences
// (lib/spaces/profile-data.ts, edited from /spaces/[slug]/settings/services) is the SAME data one
// generation back and is retiring at cutover; ServiceConfig was deliberately shaped as a field
// map of it, so this declaration reads as the destination, not a second model.
//
// WHY THIS MANIFEST MATTERS: neither service editor can attach a photo. The Shop console Catalog
// tab has no image input, and the legacy services form has no image field at all, so every
// service card in the Market renders bare. `commerce_products.images` has always been there.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities
// (`pnpm check:studio`). Everything below is data plus a few PURE read functions.
//
// VERIFY: 'none'. A Space quoting its own rate for its own work is a first-party statement, not a
// third-party claim, and there is no research pipeline or provenance ledger behind a service.
// Nothing here is flagged `commercial` (the kernel rejects commercial fields under
// verify:'none', by design).
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldOption } from '@/lib/studio/kernel/manifest'
// TYPE-ONLY import, so nothing is pulled in at runtime and the manifest stays pure. It exists to
// BIND the option values below to the real unions: add a ServicePriceModel and this file stops
// compiling until its options list catches up. lib/commerce/types.ts is itself import-free
// ("data shapes only"), so this costs nothing even before erasure. (lib/spaces/profile-data.ts
// declares the SAME price-model union for the retiring blob; binding to the commerce one keeps
// this manifest pointed at the destination model.)
import type { ProductStatus, ServicePriceModel, ServiceRecurrence } from '@/lib/commerce/types'

// ── The closed option sets (kernel `options`: known at declaration time, no loading) ──────────

/**
 * How the Space quotes the work. This is the most consequential choice in the manifest, because
 * it decides whether a price is even asked for AND which path a buyer gets: 'contact' is the one
 * sanctioned no-checkout route on the whole spine (bookServiceAction returns `enquiry`, and
 * sendServiceEnquiry opens a thread instead). Labels say what the buyer will experience.
 */
const PRICE_MODEL_OPTIONS: readonly (FieldOption & { value: ServicePriceModel })[] = [
  { value: 'fixed', label: 'One set price' },
  { value: 'from', label: 'A starting price' },
  { value: 'free', label: 'Free' },
  { value: 'contact', label: 'Contact for pricing' },
]

/** Mirrors `ServiceRecurrence`. A one-off is the default. */
const RECURRENCE_OPTIONS: readonly (FieldOption & { value: ServiceRecurrence })[] = [
  { value: 'once', label: 'One time' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
]

/** Mirrors `ProductStatus`. Same labels the Shop console already shows sellers (STATUS_LABEL in
 *  spaces/[slug]/settings/shop/catalog-tab.tsx), so one word never means two things. */
const SERVICE_STATUS_OPTIONS: readonly (FieldOption & { value: ProductStatus })[] = [
  { value: 'draft', label: 'Hidden' },
  { value: 'active', label: 'Live' },
  { value: 'sold_out', label: 'Fully booked' },
  { value: 'archived', label: 'Archived' },
]

/** One entry, honestly: `commerce_products.currency` defaults to 'usd' and checkout settles in
 *  dollars, so USD is the only currency the spine actually supports today. Stored lowercase, the
 *  way the column stores it. Adding a currency is a commerce change; this list follows it. */
const CURRENCY_OPTIONS: readonly FieldOption[] = [{ value: 'usd', label: 'US dollar (USD)' }]

/** Render a scalar as display text. Mirrors the kernel's own reader. PURE + total. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** The service config blob, safely. Never throws, never returns undefined. PURE. */
function svc(d: Record<string, unknown>): Record<string, unknown> {
  const meta = d.metadata
  if (!meta || typeof meta !== 'object') return {}
  const s = (meta as Record<string, unknown>).service
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : {}
}

/** Minor units + an ISO code as one readable amount ("120.00 USD"). Empty when unpriced. PURE. */
function money(cents: unknown, currency: unknown): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return ''
  const code = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD'
  return `${(cents / 100).toFixed(2)} ${code}`
}

/** How many photos are attached, as a sentence fragment. Empty when there are none, which keeps
 *  the gap VISIBLE on the review board rather than hiding the row. PURE. */
function photoCount(v: unknown): string {
  const n = Array.isArray(v) ? v.filter(Boolean).length : 0
  return n === 0 ? '' : `${n} photo${n === 1 ? '' : 's'}`
}

export const SERVICE_MANIFEST: EntityManifest = {
  entity: 'service',
  label: 'Service',

  // A Space quoting its own work. What the owner writes is what publishes.
  verify: 'none',

  // Photos of the room, the work, the practitioner, plus pasted text for a description that
  // already exists elsewhere. No URL importer exists for services, so none is claimed.
  accepts: ['image', 'paste'],

  // Pick a mood, steer with directions, and never let a re-draft replace the Space's own photos.
  steer: { mood: true, directions: true, lock: ['images'] },

  sections: [
    { key: 'identity', title: 'What it is', desc: 'The name of the service and what kind of work it is.' },
    { key: 'photos', title: 'Photos', desc: 'The room, the work, the person doing it. Add at least one.' },
    { key: 'details', title: 'Details', desc: 'What happens, what is included, what to bring.' },
    { key: 'pricing', title: 'Price', desc: 'How you quote it. Contact for pricing sends an enquiry instead of a checkout.' },
    { key: 'booking', title: 'Booking', desc: 'How long it runs, how often, and the calendar it books against.' },
    { key: 'policy', title: 'Cancellation policy', desc: 'How late someone can cancel, and what happens if they do not show.' },
    { key: 'reach', title: 'Where it shows', desc: 'Whether it is live, and whether it also lists in the Market.' },
  ],

  fields: [
    // ── What it is ──
    // Title is the page. Required, so the Spark asks for it regardless of placement.
    { path: 'title', label: 'Name', kind: 'text', section: 'identity', placement: 'inline', required: true },
    { path: 'category', label: 'Category', kind: 'text', section: 'identity', placement: 'spark', omitWhenEmpty: true },

    // ── Photos. Same column as a product (capped at 8 by createProduct), same gap: no service
    // editor writes it today. Never omitWhenEmpty, so "no photos" reads as a to-do.
    //
    // FIRST IS THE COVER, the same model as a product and for the same reason (ADR-992):
    // `commerce_products.images` is ordered, every reader takes `images[0]`, and the picker is
    // reorderable, so the Space designates a cover by putting it first. ONE field, no `image`
    // beside it. ──
    { path: 'images', label: 'Photos', kind: 'images', section: 'photos', placement: 'spark', veraDrafts: false, read: (d) => photoCount(d.images) },

    // ── Details (prose: Vera can draft it, the Space owns it) ──
    // The column is live and a member has no other surface to author these on, so leaving it
    // undeclared would make tagging unreachable rather than merely unwizarded.
    { path: 'tags', label: 'Tags', kind: 'tags', section: 'details', veraDrafts: true, omitWhenEmpty: true },
    { path: 'description', label: 'Details', kind: 'longtext', section: 'details', placement: 'spark', prose: true, veraDrafts: true },

    // ── Price. The price MODEL comes first because it decides whether a number is even asked for:
    // 'fixed' and 'from' quote one, 'free' and 'contact' do not, and 'contact' routes the buyer to
    // an enquiry rather than a checkout. Defaults to 'fixed' when unset. ──
    {
      path: 'metadata.service.priceModel',
      label: 'How you price it',
      kind: 'select',
      section: 'pricing',
      placement: 'spark',
      options: PRICE_MODEL_OPTIONS,
      read: (d) => str(svc(d).priceModel) || 'fixed',
    },
    // NOT required: a free or contact-only service completes creation with no number at all.
    {
      path: 'priceCents',
      label: 'Price',
      kind: 'price',
      section: 'pricing',
      placement: 'spark',
      veraDrafts: false,
      read: (d) => money(d.priceCents, d.currency),
    },
    { path: 'currency', label: 'Currency', kind: 'select', section: 'pricing', veraDrafts: false, options: CURRENCY_OPTIONS, read: (d) => str(d.currency) || 'USD' },
    // Taken upfront to hold the slot. Stored in minor units, like the price.
    {
      path: 'metadata.service.depositCents',
      label: 'Deposit to book',
      kind: 'price',
      section: 'pricing',
      veraDrafts: false,
      omitWhenEmpty: true,
      read: (d) => money(svc(d).depositCents, d.currency),
    },
    { path: 'metadata.service.slidingScale', label: 'Offer a sliding scale', kind: 'toggle', section: 'pricing', veraDrafts: false },

    // ── Booking ──
    { path: 'metadata.service.durationMin', label: 'How long it runs', kind: 'duration', section: 'booking', placement: 'spark', veraDrafts: false, omitWhenEmpty: true },
    // A `select`, not a `cadence`, and deliberately: `cadence` exists for schedules that are
    // sometimes free-form ("Wednesdays, coffee after"), which is why the kernel does not let it
    // carry options. `ServiceRecurrence` is a closed three-value column that the legacy services
    // form already renders as a three-option dropdown, so a closed set is the honest declaration.
    // Defaults to a one-off.
    {
      path: 'metadata.service.recurrence',
      label: 'How often it repeats',
      kind: 'select',
      section: 'booking',
      veraDrafts: false,
      options: RECURRENCE_OPTIONS,
      read: (d) => str(svc(d).recurrence) || 'once',
    },
    // The Space whose Booking hours this service takes times from. Without it there are no slots
    // to pick, so a bookable service is not really set up until this points somewhere. A
    // REFERENCE, not a select: the rows are queried, not literal, so the manifest names the
    // collection and the surface supplies the Spaces this owner manages that have Booking hours
    // set (never the whole table).
    { path: 'bookingSpaceId', label: 'Booking calendar', kind: 'reference', section: 'booking', veraDrafts: false, omitWhenEmpty: true, optionsFrom: 'spaces' },

    // ── Cancellation policy. Both optional: a Space with no stated policy simply has none. ──
    { path: 'metadata.service.cancellationWindowHours', label: 'Free cancellation up to', kind: 'number', section: 'policy', veraDrafts: false, omitWhenEmpty: true },
    { path: 'metadata.service.noShowFeePct', label: 'No-show fee (percent of the price)', kind: 'number', section: 'policy', veraDrafts: false, omitWhenEmpty: true },

    // ── Where it shows ──
    // status 'active' means live in this Space's own Shop; this flag ALSO lists it in the
    // cross-Space Market (ADR-596).
    { path: 'marketPublished', label: 'Also list in the Market', kind: 'toggle', section: 'reach', veraDrafts: false },
    {
      path: 'status',
      label: 'Status',
      kind: 'select',
      section: 'reach',
      veraDrafts: false,
      options: SERVICE_STATUS_OPTIONS,
      read: (d) => str(d.status) || 'draft',
    },
  ],

  // No repeats. Service TIERS do not exist today: a Space's services are siblings in one catalog
  // (each its own `commerce_products` row, so each is its own Service), not children of one
  // service, and the only multi-session idea in the retiring SpaceOffering blob is a
  // `packageCount` number rather than a collection. When tiers land they become a RepeatDef here,
  // one row per tier so each tier's price is edited and reviewed on its own, and nothing else
  // changes.
}

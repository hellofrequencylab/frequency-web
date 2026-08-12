// ─────────────────────────────────────────────────────────────────────────────
// THE PRODUCT ENTITY MANIFEST (docs/STUDIO.md, ADR-597 · docs/SHOP-MARKETPLACE-PLAN.md, ADR-596).
//
// ONE thing a member or a Space sells in the Market: a physical or digital item that ships or
// hands over. It is the same declaration whether a PAID member lists their one piece from
// /market/sell or a Business Space adds a row from the Shop console Catalog tab, because both
// write the SAME `commerce_products` row (owner_kind discriminates; nothing else differs).
// That is the whole point of declaring it once here.
//
// WHY THIS MANIFEST MATTERS MOST: today /market/sell cannot attach a photo at all. The column
// (`commerce_products.images`, capped at 8 by createProduct) has existed since the commerce core
// migration and no creation surface has ever written to it. Declaring `images` here is what
// closes that gap everywhere at once, instead of one more bespoke uploader on one more page.
//
// This file is a DECLARATION, the same law as SPACE_MODULES (ADR-553): it says WHAT a product
// draft contains and how it groups, and nothing about how any of it renders.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities
// (`pnpm check:studio`). Everything below is data plus a few PURE read functions.
//
// The field paths mirror `CommerceProduct` / `ProductInput` (lib/commerce/types.ts) exactly, so a
// draft is the insert payload and the two can never drift.
//
// VERIFY: 'none'. A product is a member's own first-party listing. There is no research pipeline
// and no provenance ledger behind it, so its price is something the seller states about their own
// work, not a third-party claim needing a citation. Nothing here is flagged `commercial` (the
// kernel rejects commercial fields under verify:'none', by design).
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldOption } from '@/lib/studio/kernel/manifest'
// TYPE-ONLY import, so nothing is pulled in at runtime and the manifest stays pure. It exists to
// BIND the option values below to the real unions: add a ProductStatus and this file stops
// compiling until its options list catches up. lib/commerce/types.ts is itself import-free
// ("data shapes only"), so this costs nothing even before erasure.
import type { ProductKind, ProductStatus } from '@/lib/commerce/types'

// ── The closed option sets (kernel `options`: known at declaration time, no loading) ──────────

/**
 * A PRODUCT is a thing that ships or downloads. The `product_kind` column carries five values, but
 * only these two belong to this manifest: 'service' and 'booking' are the Service entity, 'ticket'
 * is a Ticket. `marketGroupForKind` (lib/commerce/types.ts) draws the same line for the Market
 * rails, so the split here is the existing one, not a new one.
 */
const PRODUCT_KIND_OPTIONS: readonly (FieldOption & { value: ProductKind })[] = [
  { value: 'physical', label: 'Something you ship or hand over' },
  { value: 'digital', label: 'Something they download' },
]

/** Mirrors `ProductStatus`. The labels are the ones the Shop console already shows sellers
 *  (STATUS_LABEL in spaces/[slug]/settings/shop/catalog-tab.tsx), so one word never means two
 *  things across two surfaces. */
const PRODUCT_STATUS_OPTIONS: readonly (FieldOption & { value: ProductStatus })[] = [
  { value: 'draft', label: 'Hidden' },
  { value: 'active', label: 'Live' },
  { value: 'sold_out', label: 'Sold out' },
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

/** Minor units + an ISO code as one readable amount ("28.00 USD"). Empty when unpriced. PURE. */
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

export const PRODUCT_MANIFEST: EntityManifest = {
  entity: 'product',
  label: 'Product',

  // First-party, member-authored. The seller states their own price; there is nothing to cite.
  verify: 'none',

  // Photos are the point (see the header note) and pasted text covers "I already wrote this
  // description somewhere else". No URL importer exists for products, so none is claimed.
  accepts: ['image', 'paste'],

  // Pick a mood, steer with directions, and never let a re-draft replace the seller's own photos.
  steer: { mood: true, directions: true, lock: ['images'] },

  sections: [
    { key: 'identity', title: 'What it is', desc: 'The name and type of thing you are selling.' },
    { key: 'photos', title: 'Photos', desc: 'What buyers see first. Add at least one.' },
    { key: 'details', title: 'Details', desc: 'Materials, size, how it is made, shipping or pickup.' },
    { key: 'pricing', title: 'Price and stock', desc: 'What it costs and how many you have.' },
    { key: 'reach', title: 'Where it shows', desc: 'Whether it is live, and whether it also lists in the Market.' },
  ],

  fields: [
    // ── What it is ──
    // Title is the page. Required, so the Spark asks for it regardless of placement.
    { path: 'title', label: 'Name', kind: 'text', section: 'identity', placement: 'inline', required: true },
    // 'physical' ships, 'digital' downloads. Defaults to physical when the draft leaves it unset,
    // matching createProduct.
    {
      path: 'productKind',
      label: 'Type',
      kind: 'select',
      section: 'identity',
      placement: 'spark',
      options: PRODUCT_KIND_OPTIONS,
      read: (d) => str(d.productKind) || 'physical',
    },
    { path: 'category', label: 'Category', kind: 'text', section: 'identity', placement: 'spark', omitWhenEmpty: true },

    // ── Photos. The gap this manifest exists to close: the column takes up to 8 and no creation
    // surface has ever written to it. Never omitWhenEmpty, so "no photos" reads as a to-do. ──
    { path: 'images', label: 'Photos', kind: 'images', section: 'photos', placement: 'spark', veraDrafts: false, read: (d) => photoCount(d.images) },

    // ── Details (prose: Vera can draft it, the seller owns it) ──
    // The column is live and a member has no other surface to author these on, so leaving it
    // undeclared would make tagging unreachable rather than merely unwizarded.
    { path: 'tags', label: 'Tags', kind: 'tags', section: 'details', veraDrafts: true, omitWhenEmpty: true },
    { path: 'description', label: 'Details', kind: 'longtext', section: 'details', placement: 'spark', prose: true, veraDrafts: true },

    // ── Price and stock. Stored in MINOR units (cents), displayed composed with the currency. ──
    {
      path: 'priceCents',
      label: 'Price',
      kind: 'price',
      section: 'pricing',
      placement: 'spark',
      required: true,
      veraDrafts: false,
      read: (d) => money(d.priceCents, d.currency),
    },
    { path: 'currency', label: 'Currency', kind: 'select', section: 'pricing', veraDrafts: false, options: CURRENCY_OPTIONS, read: (d) => str(d.currency) || 'USD' },
    // Null stock means "no limit", so an empty row is meaningless noise on the board.
    { path: 'stock', label: 'How many you have', kind: 'number', section: 'pricing', veraDrafts: false, omitWhenEmpty: true },

    // ── Where it shows ──
    // A Space listing is live in that Space's own Shop at status 'active'; this flag ALSO lists it
    // in the cross-Space Market (the maker path opts in on create, ADR-596).
    { path: 'marketPublished', label: 'Also list in the Market', kind: 'toggle', section: 'reach', veraDrafts: false },
    {
      path: 'status',
      label: 'Status',
      kind: 'select',
      section: 'reach',
      veraDrafts: false,
      options: PRODUCT_STATUS_OPTIONS,
      read: (d) => str(d.status) || 'draft',
    },
  ],

  // No repeats. Variants (size, colour) do NOT exist: commerce_variants was never populated and
  // was dropped outright in migration 20260928000000, with commerce_order_items.variant_id going
  // with it. When variants come back they become a RepeatDef here (one row per variant, so each
  // variant's own price is edited and reviewed on its own), and nothing else changes.
}

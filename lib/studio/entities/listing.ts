// ─────────────────────────────────────────────────────────────────────────────
// THE CLASSIFIEDS LISTING MANIFEST (docs/STUDIO.md, ADR-597 · ADR-148).
//
// ONE post on the peer board: something a member is offering, giving away, lending, or looking
// for. Free for anyone to post, and deliberately NOT commerce: no checkout, no fee, no order.
// The listing connects two neighbours and they arrange the rest offline, which is why the price
// is a free-text NOTE ("$20, or a trade, or free") rather than an amount (docs/NAMING.md:
// Classifieds is the connect-only board; Market is the umbrella that takes payment).
//
// WHY THIS MANIFEST MATTERS: the two surfaces that create and edit a listing today
// (components/studio/market/new-listing-button.tsx and listing-builder.tsx) collect photos as
// URLs typed into a raw textarea, one per line. Nobody with a photo on their phone can post one.
// Declaring `images` as an images field is what turns that textarea into an uploader everywhere
// at once, without either surface being rewritten by hand.
//
// This file is a DECLARATION, the same law as SPACE_MODULES (ADR-553): it says WHAT a listing
// draft contains and how it groups, and nothing about how any of it renders.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities
// (`pnpm check:studio`). Everything below is data plus a few PURE read functions.
//
// The field paths mirror `ListingInput` / `ListingPatch` (lib/marketplace.ts) exactly, so a draft
// patch is what the save action already takes and the two can never drift.
//
// VERIFY: 'none'. A member describing their own couch is not making a third-party claim, there is
// no research pipeline and no provenance ledger behind a listing, and the price note is a
// negotiating position rather than a fact. Nothing here is flagged `commercial` (the kernel
// rejects commercial fields under verify:'none', by design).
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldOption } from '@/lib/studio/kernel/manifest'

// ── The closed option sets (kernel `options`: known at declaration time, no loading) ──────────
//
// RESTATED, NOT IMPORTED, on purpose. `LISTING_KINDS` and the `ListingKind` / `ListingStatus`
// unions all live in lib/marketplace.ts, which opens with `import { createAdminClient } from
// '@/lib/supabase/admin'` and is server-only. Importing the constant would pull the Supabase admin
// client into a module the kernel contract requires to be pure, and purity wins over reuse. These
// two lists MIRROR lib/marketplace.ts; change the kinds or the statuses there and change them here.

/** Mirrors `LISTING_KINDS` (lib/marketplace.ts), labels included, in the same order the board
 *  shows them: offer, free, lend, request. */
const LISTING_KIND_OPTIONS: readonly FieldOption[] = [
  { value: 'offer', label: 'Offering' },
  { value: 'free', label: 'Free' },
  { value: 'lend', label: 'To lend' },
  { value: 'request', label: 'Looking for' },
]

/** Mirrors `ListingStatus` (lib/marketplace.ts). 'claimed' is "someone took it"; 'closed' is
 *  "I am done with this post". */
const LISTING_STATUS_OPTIONS: readonly FieldOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'closed', label: 'Closed' },
]

/** Render a scalar as display text. Mirrors the kernel's own reader. PURE + total. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** How many photos are attached, as a sentence fragment. Empty when there are none, which keeps
 *  the gap VISIBLE on the review board rather than hiding the row. PURE. */
function photoCount(v: unknown): string {
  const n = Array.isArray(v) ? v.filter(Boolean).length : 0
  return n === 0 ? '' : `${n} photo${n === 1 ? '' : 's'}`
}

export const LISTING_MANIFEST: EntityManifest = {
  entity: 'listing',
  label: 'Classifieds listing',

  // Neighbour to neighbour, no ledger. What the author writes is what publishes.
  verify: 'none',

  // A photo from the phone is the whole ask here, and pasted text covers "I already wrote this
  // in a group chat". No URL importer exists for the peer board, so none is claimed.
  accepts: ['image', 'paste'],

  // Pick a mood, steer with directions, and never let a re-draft replace the member's own photos.
  steer: { mood: true, directions: true, lock: ['images'] },

  sections: [
    { key: 'identity', title: 'What it is', desc: 'The headline and whether you are offering or looking.' },
    { key: 'photos', title: 'Photos', desc: 'What neighbours see first. Add at least one.' },
    { key: 'details', title: 'Details', desc: 'Condition, size, when and where to pick up.' },
    { key: 'terms', title: 'Price or terms', desc: 'Free text. No money moves in the app, so say what you have in mind.' },
    { key: 'place', title: 'Where it is', desc: 'Neighborhood and city, plus an optional pin so people can find it by distance.' },
    { key: 'reach', title: 'Where it shows', desc: 'The Circle it posts to, and whether it is still going.' },
  ],

  fields: [
    // ── What it is ──
    // Title is the page. Required, so the Spark asks for it regardless of placement.
    { path: 'title', label: 'Headline', kind: 'text', section: 'identity', placement: 'inline', required: true },
    // LISTING_KINDS: offer / free / lend / request. Defaults to 'offer' when unset, matching
    // createListing.
    {
      path: 'kind',
      label: 'Type',
      kind: 'select',
      section: 'identity',
      placement: 'spark',
      options: LISTING_KIND_OPTIONS,
      read: (d) => str(d.kind) || 'offer',
    },
    { path: 'category', label: 'Category', kind: 'text', section: 'identity', placement: 'spark', omitWhenEmpty: true },

    // ── Photos. The gap this manifest exists to close: stored as a string[] (capped at 6 by
    // cleanImages) and collected today as URLs in a textarea. Never omitWhenEmpty, so "no photos"
    // reads as a to-do. ──
    { path: 'images', label: 'Photos', kind: 'images', section: 'photos', placement: 'spark', veraDrafts: false, read: (d) => photoCount(d.images) },

    // ── Details (prose: Vera can draft it, the member owns it) ──
    { path: 'description', label: 'Details', kind: 'longtext', section: 'details', placement: 'inline', prose: true, veraDrafts: true },

    // ── Price or terms. FREE TEXT on purpose: a trade, a favour, and "make me an offer" are all
    // valid answers on the peer board, so this is not an amount. ──
    { path: 'priceNote', label: 'Price or terms', kind: 'text', section: 'terms', placement: 'spark', veraDrafts: false, omitWhenEmpty: true },

    // ── Where it is. Neighborhood and city are typed; the pin is optional and only ever powers
    // "near me" sorting, never an exact address on the card. ──
    { path: 'neighborhood', label: 'Neighborhood', kind: 'text', section: 'place', placement: 'spark', omitWhenEmpty: true },
    { path: 'city', label: 'City', kind: 'text', section: 'place', placement: 'spark', omitWhenEmpty: true },
    // ONE map control writes the lat/lng PAIR, so the pair is declared at the latitude path (the
    // real persisted column the ledger keys by) and composed for display. `longitude` is written
    // by the same control and is deliberately not a second row.
    {
      path: 'latitude',
      label: 'Pinned location',
      kind: 'place',
      section: 'place',
      veraDrafts: false,
      omitWhenEmpty: true,
      read: (d) => {
        const lat = d.latitude
        const lng = d.longitude
        if (typeof lat !== 'number' || typeof lng !== 'number') return ''
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      },
    },

    // ── Where it shows ──
    // An optional Circle to post into. A REFERENCE, not a select: the rows are queried, not
    // literal, so the manifest names the collection and the surface supplies the Circles this
    // member can actually post into (never the whole table).
    { path: 'circleId', label: 'Circle', kind: 'reference', section: 'reach', veraDrafts: false, omitWhenEmpty: true, optionsFrom: 'circles' },
    // Set from the listing page after the fact, never at creation.
    {
      path: 'status',
      label: 'Status',
      kind: 'select',
      section: 'reach',
      veraDrafts: false,
      options: LISTING_STATUS_OPTIONS,
      read: (d) => str(d.status) || 'active',
    },
  ],

  // No repeats. A listing is one flat thing: no variants, no tiers, no child collection. The
  // images array is a scalar list, which is the `images` FIELD kind, not a RepeatDef.
}

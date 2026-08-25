// ─────────────────────────────────────────────────────────────────────────────
// THE HOUSING LISTING MANIFEST (docs/STUDIO.md, ADR-1151 · ADR-39Y · ADR-867).
//
// A place to live, posted by the member who lives there or owns it. CONNECT-ONLY, the same law as
// Classifieds: no checkout, no deposit taken, no application fee. A neighbour reads the listing and
// messages the host, and everything after that happens between the two of them.
//
// WHY THIS FILE EXISTS. Housing sat OUTSIDE the Studio entirely — its member form
// (app/(main)/housing/new/housing-form.tsx) hand-rolls 31 controls, and the listing-seeder's review
// board hand-rolled a second field list beside it, while both sibling seeders derive theirs from a
// manifest. That is two independent descriptions of one entity, and they had already drifted.
//
// WHY NOT JUST WIDEN `listing`. LISTING_MANIFEST is the CLASSIFIEDS board: a couch, a lawnmower, a
// ride to the airport. Eleven fields, a free-text price note, and `verify: 'none'` because a member
// describing their own couch makes no third-party claim. Housing shares five of those paths and
// diverges on twenty-six, including a whole privacy model (`addressPrecision`) that a couch does not
// have. Merging them would give every classifieds post a bedroom count and every housing post a
// price note that means nothing. Two entities, one kernel, which is what the kernel is for.
//
// The field paths mirror `HousingFormInitial` (app/(main)/housing/new/housing-form.tsx) EXACTLY,
// which is the same shape the edit surface prefills and the create/update actions read back. One
// spelling of every field, so the form, the review board and the manifest cannot drift.
//
// ── VERIFY: 'none', AND THE RENT IS THE REASON TO SAY WHY ────────────────────────────────────────
// Rent, deposit and move-in costs LOOK like the commercial facts the kernel gates. They are not.
// The `commercial` flag means "a fact asserted about a THIRD PARTY that must be cited before it
// publishes" — the Business Seeder claiming a restaurant's hours. Here the member is stating their
// own asking price for their own home, which is a negotiating position, not a claim about someone
// else, and there is no research pipeline or provenance ledger behind a housing post to cite. So
// nothing is flagged `commercial`, exactly as in LISTING_MANIFEST, and the kernel's rule that a
// commercial field under `verify: 'none'` could never clear is satisfied by construction.
//
// ── MONEY IS IN DOLLARS ──────────────────────────────────────────────────────────────────────────
// `rentDollars` / `depositDollars` / `moveInCostsDollars` carry the DOLLAR amount, matching what the
// form's inputs show and what `HousingFormInitial` documents. The paths keep the `Dollars` suffix so
// nothing downstream can mistake them for the cents the DB stores.
//
// ── FAIR HOUSING, WHICH IS A HARD LINE, NOT A PREFERENCE ─────────────────────────────────────────
// Every field here is a fact about the HOME. There is no field for who should apply, and there must
// never be one: `veraDrafts` is OFF for every house rule and every occupancy field, so no generated
// copy can turn "max 2 occupants" into a sentence about families. Vera drafts exactly one field on
// this entity, the free-prose `description`, and the voice primer (lib/ai/voice.ts) governs it.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities
// (`pnpm check:studio`). Everything below is data plus PURE read functions.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldOption } from '@/lib/studio/kernel/manifest'
import {
  ACCESSIBILITY_TAGS,
  ADDRESS_PRECISIONS,
  AMENITIES,
  LAUNDRY_OPTIONS,
  PARKING_OPTIONS,
  PROPERTY_TYPES,
} from '@/lib/listings/types'

// ── The closed option sets ───────────────────────────────────────────────────────────────────────
//
// IMPORTED, NOT RESTATED — and that is the opposite of what LISTING_MANIFEST had to do. That file
// restates its kinds because they live in lib/marketplace.ts, which opens with an import of the
// Supabase admin client and is server-only; pulling it in would break the purity the kernel contract
// requires. lib/listings/types.ts has ZERO imports and says so in its own header ("Pure data (no
// server imports) so client forms can render the pickers directly"), so importing is safe here and
// strictly better: these vocabularies are in lockstep with DB CHECK constraints, and a restated copy
// is a copy that can drift away from the constraint that rejects the write.

/** `{ slug, label }` (lib/listings/types) -> the kernel's `{ value, label }`. PURE. */
function toOptions(xs: readonly { slug: string; label: string }[]): readonly FieldOption[] {
  return xs.map((x) => ({ value: x.slug, label: x.label }))
}

/** The listing INTENT, mirroring `HousingType` and the form's own Select, in the same order.
 *  Restated rather than imported because lib/listings/types exports the union as a TYPE with no
 *  labelled constant beside it — there is no array to import. If one is ever added there, import it. */
const HOUSING_TYPE_OPTIONS: readonly FieldOption[] = [
  { value: 'rental', label: 'Rental to offer' },
  { value: 'sublet', label: 'Sublet to offer' },
  { value: 'roommate', label: 'Room with a roommate' },
  { value: 'roommate_wanted', label: 'Looking for a roommate' },
  { value: 'housing_wanted', label: 'Looking for a place' },
]

/** Mirrors `RoomType`. Same note as above: a type union with no labelled constant to import. */
const ROOM_TYPE_OPTIONS: readonly FieldOption[] = [
  { value: 'private_room', label: 'Private room' },
  { value: 'shared_room', label: 'Shared room' },
  { value: 'entire_place', label: 'Entire place' },
]

const PROPERTY_TYPE_OPTIONS = toOptions(PROPERTY_TYPES)
const PARKING_OPTIONS_KERNEL = toOptions(PARKING_OPTIONS)
const LAUNDRY_OPTIONS_KERNEL = toOptions(LAUNDRY_OPTIONS)
const AMENITY_OPTIONS = toOptions(AMENITIES)
const ACCESSIBILITY_OPTIONS = toOptions(ACCESSIBILITY_TAGS)
const ADDRESS_PRECISION_OPTIONS = toOptions(ADDRESS_PRECISIONS)

// ── PURE readers ─────────────────────────────────────────────────────────────────────────────────

/** Render a scalar as display text. Mirrors the kernel's own reader. PURE + total. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** A dollar amount as money, or '' when unset. NOT `$0` for a missing value: an empty rent is a gap
 *  the review board should show as a gap, and "$0" would read as "free". PURE. */
function dollars(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return ''
  return `$${v.toLocaleString('en-US')}`
}

/** A count with its unit, or '' when unset. PURE. */
function count(v: unknown, one: string, many: string): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return ''
  return `${v} ${v === 1 ? one : many}`
}

/** How many photos are attached. Empty when there are none, keeping the gap VISIBLE. PURE. */
function photoCount(v: unknown): string {
  const n = Array.isArray(v) ? v.filter(Boolean).length : 0
  return n === 0 ? '' : `${n} photo${n === 1 ? '' : 's'}`
}

/** Render a picked list as its LABELS, in vocabulary order. A review board that printed
 *  `in_unit_laundry` would be showing a member a database slug. PURE. */
function labels(v: unknown, vocab: readonly FieldOption[]): string {
  if (!Array.isArray(v)) return ''
  const picked = new Set(v.filter((x): x is string => typeof x === 'string'))
  return vocab.filter((o) => picked.has(o.value)).map((o) => o.label).join(', ')
}

/** A boolean as a word. '' when false, so a review board lists the rules that APPLY rather than a
 *  column of "No". PURE. */
function flag(v: unknown, yes: string): string {
  return v === true ? yes : ''
}

export const HOUSING_MANIFEST: EntityManifest = {
  entity: 'housing',
  label: 'Housing listing',

  // Connect-only, member-authored, no ledger. See the header: rent is a negotiating position, not a
  // third-party claim, so nothing here is `commercial` and nothing needs citing.
  verify: 'none',

  // Photos from the phone, and pasted text for "I already wrote this listing somewhere else".
  // No URL importer: there is no housing feed this pulls from.
  accepts: ['image', 'paste'],

  // Mood and directions steer the DESCRIPTION only. `lock` keeps a re-draft off the member's own
  // photos and off the whole privacy decision — a regenerate must never quietly widen how much of
  // an address the listing shows.
  steer: { mood: true, directions: true, lock: ['images', 'addressPrecision', 'addressLine'] },

  // ── WHAT THE SPARK ASKS, AND WHY IT IS EXACTLY EIGHT ────────────────────────────────────────────
  // The kernel caps a Spark at eight questions (lib/studio/registry.test.ts), and it is not a style
  // rule: a guided flow people abandon is worse than the form it replaced. This manifest was first
  // written asking eleven, so three were moved to the rail, chosen by what a member cannot post
  // WITHOUT:
  //   title · listingType · roomType · rentDollars · availableFrom · images · description · city
  // Moved to the rail: `propertyType` (a refinement of roomType — "private room in a condo" is a
  // second question about an answer already given), `amenities` (a twelve-checkbox grid, which is a
  // browsing surface rather than a question), and `neighborhood` (optional, and a refinement of the
  // city already asked). Nothing was dropped; every one of the 31 fields is still declared, and the
  // edit rail is where the rest live. `placement` is the ONE seam between creating and editing
  // (ADR-450 §2), which is exactly what makes this a placement change rather than a scope cut.
  sections: [
    { key: 'identity', title: 'The place', desc: 'What you are listing and what kind of home it is.' },
    { key: 'photos', title: 'Photos', desc: 'What people see first. The first one is the cover.' },
    { key: 'terms', title: 'Rent and terms', desc: 'What it costs and how long the stay is. No money moves in the app.' },
    { key: 'space', title: 'The space', desc: 'Rooms, size, and who else is in the home.' },
    { key: 'features', title: 'Features', desc: 'Amenities, parking, laundry, and accessibility.' },
    { key: 'rules', title: 'House rules', desc: 'What is allowed and what is included. Facts about the home only.' },
    { key: 'details', title: 'Details', desc: 'The description a neighbour reads before messaging you.' },
    { key: 'place', title: 'Where it is', desc: 'Neighborhood and city, and how much of the address to show.' },
  ],

  fields: [
    // ── The place ──
    { path: 'title', label: 'Title', kind: 'text', section: 'identity', placement: 'inline', required: true },
    {
      path: 'listingType',
      label: 'Listing',
      kind: 'select',
      section: 'identity',
      placement: 'spark',
      options: HOUSING_TYPE_OPTIONS,
      read: (d) => str(d.listingType) || 'rental',
    },
    {
      path: 'propertyType',
      label: 'Property type',
      kind: 'select',
      section: 'identity',
      placement: 'rail',
      options: PROPERTY_TYPE_OPTIONS,
      omitWhenEmpty: true,
    },
    {
      path: 'roomType',
      label: 'Space',
      kind: 'select',
      section: 'identity',
      placement: 'spark',
      options: ROOM_TYPE_OPTIONS,
      omitWhenEmpty: true,
    },

    // ── Photos. Same model as a classifieds listing (ADR-992): the list is ORDERED and the first
    // entry is the cover, so there is no second `image` field to reconcile. Never omitWhenEmpty —
    // a housing post with no photos is a to-do, not a tidy row to hide. ──
    { path: 'images', label: 'Photos', kind: 'images', section: 'photos', placement: 'spark', veraDrafts: false, read: (d) => photoCount(d.images) },

    // ── Rent and terms. Dollars, never cents. veraDrafts OFF on every one: a generated rent is a
    // number a member did not choose, attached to their own home. ──
    { path: 'rentDollars', label: 'Rent (per month)', kind: 'price', section: 'terms', placement: 'spark', veraDrafts: false, read: (d) => dollars(d.rentDollars) },
    { path: 'depositDollars', label: 'Deposit', kind: 'price', section: 'terms', veraDrafts: false, omitWhenEmpty: true, read: (d) => dollars(d.depositDollars) },
    { path: 'moveInCostsDollars', label: 'Move-in costs', kind: 'price', section: 'terms', veraDrafts: false, omitWhenEmpty: true, read: (d) => dollars(d.moveInCostsDollars) },
    { path: 'leaseMonths', label: 'Lease', kind: 'number', section: 'terms', veraDrafts: false, omitWhenEmpty: true, read: (d) => count(d.leaseMonths, 'month', 'months') },
    { path: 'minStayMonths', label: 'Minimum stay', kind: 'number', section: 'terms', veraDrafts: false, omitWhenEmpty: true, read: (d) => count(d.minStayMonths, 'month', 'months') },
    { path: 'availableFrom', label: 'Available from', kind: 'date', section: 'terms', placement: 'spark', veraDrafts: false, omitWhenEmpty: true },

    // ── The space. Every one is a fact about the HOME (see the fair-housing note in the header),
    // and every one has veraDrafts OFF so no generated sentence can reframe an occupancy limit as
    // a statement about who lives there. ──
    { path: 'bedrooms', label: 'Bedrooms', kind: 'number', section: 'space', veraDrafts: false, omitWhenEmpty: true },
    { path: 'bathrooms', label: 'Bathrooms', kind: 'number', section: 'space', veraDrafts: false, omitWhenEmpty: true },
    { path: 'sqft', label: 'Square feet', kind: 'number', section: 'space', veraDrafts: false, omitWhenEmpty: true },
    { path: 'householdSize', label: 'People in the home', kind: 'number', section: 'space', veraDrafts: false, omitWhenEmpty: true },
    { path: 'maxOccupants', label: 'Max occupants', kind: 'number', section: 'space', veraDrafts: false, omitWhenEmpty: true },

    // ── Features. `multiselect`, not `tags`: these vocabularies are enforced by DB CHECK
    // constraints (housing_listings_amenities_vocab, housing_listings_accessibility_vocab), so a
    // free-text tag control would collect a value the database rejects at write. That is the gap
    // the `multiselect` kind was added to the kernel to close. ──
    {
      path: 'amenities',
      label: 'Amenities',
      kind: 'multiselect',
      section: 'features',
      placement: 'rail',
      options: AMENITY_OPTIONS,
      veraDrafts: false,
      omitWhenEmpty: true,
      read: (d) => labels(d.amenities, AMENITY_OPTIONS),
    },
    {
      path: 'accessibility',
      label: 'Accessibility',
      kind: 'multiselect',
      section: 'features',
      options: ACCESSIBILITY_OPTIONS,
      veraDrafts: false,
      omitWhenEmpty: true,
      read: (d) => labels(d.accessibility, ACCESSIBILITY_OPTIONS),
    },
    {
      path: 'parking',
      label: 'Parking',
      kind: 'select',
      section: 'features',
      options: PARKING_OPTIONS_KERNEL,
      veraDrafts: false,
      omitWhenEmpty: true,
    },
    {
      path: 'laundry',
      label: 'Laundry',
      kind: 'select',
      section: 'features',
      options: LAUNDRY_OPTIONS_KERNEL,
      veraDrafts: false,
      omitWhenEmpty: true,
    },

    // ── House rules. Toggles, read as the rule they express when ON and as nothing when OFF, so
    // the review board lists what APPLIES instead of a column of "No". ──
    { path: 'furnished', label: 'Furnished', kind: 'toggle', section: 'rules', veraDrafts: false, omitWhenEmpty: true, read: (d) => flag(d.furnished, 'Furnished') },
    { path: 'utilitiesIncluded', label: 'Utilities included', kind: 'toggle', section: 'rules', veraDrafts: false, omitWhenEmpty: true, read: (d) => flag(d.utilitiesIncluded, 'Utilities included') },
    { path: 'petsOk', label: 'Pets welcome', kind: 'toggle', section: 'rules', veraDrafts: false, omitWhenEmpty: true, read: (d) => flag(d.petsOk, 'Pets welcome') },
    { path: 'smokingOk', label: 'Smoking OK', kind: 'toggle', section: 'rules', veraDrafts: false, omitWhenEmpty: true, read: (d) => flag(d.smokingOk, 'Smoking OK') },
    { path: 'cannabisOk', label: 'Cannabis friendly', kind: 'toggle', section: 'rules', veraDrafts: false, omitWhenEmpty: true, read: (d) => flag(d.cannabisOk, 'Cannabis friendly') },
    { path: 'bathroomsShared', label: 'Shared bathroom', kind: 'toggle', section: 'rules', veraDrafts: false, omitWhenEmpty: true, read: (d) => flag(d.bathroomsShared, 'Shared bathroom') },

    // ── Details. THE ONE FIELD VERA DRAFTS on this entity. ──
    { path: 'description', label: 'Details', kind: 'longtext', section: 'details', placement: 'spark', prose: true, veraDrafts: true },

    // ── Where it is, and how much of it to show. `addressPrecision` is the member's PRIVACY
    // decision and is never omitWhenEmpty: it always renders, because "what does this listing
    // reveal" is not a row anyone should have to go looking for. `addressLine` exists only while
    // 'exact' is chosen, which is why it is locked against a re-draft alongside the precision
    // itself (see `steer.lock`). ──
    { path: 'neighborhood', label: 'Neighborhood', kind: 'text', section: 'place', placement: 'rail', omitWhenEmpty: true },
    { path: 'city', label: 'City', kind: 'text', section: 'place', placement: 'spark', required: true },
    {
      path: 'addressPrecision',
      label: 'Address shown',
      kind: 'select',
      section: 'place',
      options: ADDRESS_PRECISION_OPTIONS,
      veraDrafts: false,
      read: (d) => str(d.addressPrecision) || 'city',
    },
    { path: 'addressLine', label: 'Street address', kind: 'address', section: 'place', veraDrafts: false, omitWhenEmpty: true },
  ],

  // No repeats. A housing listing is one flat place: no units, no tiers, no child collection. The
  // three list-valued fields (images, amenities, accessibility) are scalar lists, which are FIELD
  // kinds, not RepeatDefs.
}

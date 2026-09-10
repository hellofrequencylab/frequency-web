// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT ENTITY MANIFEST (docs/STUDIO.md §0, ADR-597).
//
// The second entity declared against the Studio kernel, and the widest one: a flyer carries
// more shapes than any other draft we take in (a lineup, set times, ticket tiers, links,
// sponsors), so if the kernel can carry an event it can carry the long tail.
//
// This file is a DECLARATION, the same law as SPACE_MODULES (ADR-553) and BUSINESS_MANIFEST:
// it says WHAT an event draft contains and how it groups, and nothing about how any of it
// renders. The Spark, the review board, and the edit rail all compose from these rows.
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities
// (`pnpm check:studio`). Everything below is data plus a few PURE read functions.
//
// The field paths mirror the REAL draft shape, which is one vocabulary across three surfaces:
//   • `ExtractedEvent` + `EventDetails` (lib/events/types.ts) — what the poster scan and
//     Vera's Spark yield, and what the draft store holds;
//   • the create/edit FormData keys `createEvent` / `updateEvent` read
//     (app/(main)/events/actions.ts), which land in the `events` columns of the same name;
//   • `events.details` (JSONB) for everything under `details.*`.
// Those paths are also the provenance-ledger keys, so they must stay literal.
//
// NO LEDGER (`verify: 'none'`): an event is the author's own gathering, not researched third
// party facts, so what the host writes publishes. That also means NO field here may be marked
// `commercial` (the manifest validator rejects a commercial fact under `verify: 'none'`,
// because nothing could ever clear it). The price and the ticket tiers are the host's own
// numbers, so this is correct rather than a compromise.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldOption } from '@/lib/studio/kernel/manifest'
// The canonical event vocabularies (ADR-879/887, enforced by `pnpm check:vocab`). This module is
// genuinely PURE (zero imports), so the manifest reads the source rather than restating it. An
// earlier pass copied these out of the `'use client'` create form, which is exactly the drift the
// vocab guard exists to catch: a hand copy silently loses a category the moment one is added.
import {
  ATTENDANCE_OPTIONS,
  CATEGORY_OPTIONS,
  ENERGY_OPTIONS,
  VISIBILITY_OPTIONS,
} from '@/lib/events/options'
// Three more PURE modules (zero imports each), read for the same reason: the curated zones and the
// two theme-bag switches' member-facing words have one source, and the manifest is not a second.
import { COMMON_TIME_ZONES, HOME_TIME_ZONE } from '@/lib/events/time-zones'
import { CHECK_IN_LABEL } from '@/lib/events/checkin-enabled'
// The repeat engine is pure and import-free, so the manifest may read a rule back as words for the
// review board without becoming impure itself (lib/events/repeat-rule.ts, ADR-1299).
import { describeRepeat, parseRepeat } from '@/lib/events/repeat-rule'
import { MARKET_LISTING_LABEL } from '@/lib/events/market-listing'

/** How people get in (ADR-826): one join function per event. Mirrors the CHECK constraint on
 *  `events.join_mode` and the settings action's own allow-list (`['auto', 'rsvp', 'tickets']`). */
const JOIN_MODE_OPTIONS: readonly FieldOption[] = [
  { value: 'auto', label: 'Automatic (tickets when priced, else RSVP)' },
  { value: 'rsvp', label: 'RSVP, first come first served (prices are informational)' },
  { value: 'tickets', label: 'Tickets (buying is how people attend)' },
]

// ── The closed choice sets ───────────────────────────────────────────────────────────────
//
// RESTATED, not imported, and that is deliberate in every case below:
//   • The create form (app/(main)/events/new/event-form.tsx) declares CATEGORY_OPTIONS,
//     VISIBILITY_OPTIONS, ENERGY_OPTIONS, ATTENDANCE_OPTIONS and RECURRENCE_OPTIONS, but that
//     file is `'use client'` and none of them are exported, so importing would both fail and
//     drag React into a module that must stay pure.
//   • The rest (the Domains, a lineup role, a link kind) exist only as TypeScript UNION TYPES
//     in lib/events/types.ts, which have no runtime value to import at all.
// The values below are the literal persisted strings the server re-validates against, so a
// drift shows up as a rejected write rather than a silent mismatch. Keep them in step with the
// file named above each set.

/** The four Domains. Mirrors `DomainSlug` (lib/events/types.ts), itself the `domains.slug`
 *  taxonomy (migration 20260604010000_channels_domains_taxonomy). */
const DOMAINS: readonly FieldOption[] = [
  { value: 'mind', label: 'Mind' },
  { value: 'body', label: 'Body' },
  { value: 'spirit', label: 'Spirit' },
  { value: 'expression', label: 'Expression' },
]

/** Mirrors `LineupItem['role']` (lib/events/types.ts). */
const LINEUP_ROLES: readonly FieldOption[] = [
  { value: 'band', label: 'Band' },
  { value: 'speaker', label: 'Speaker' },
  { value: 'dj', label: 'DJ' },
  { value: 'performer', label: 'Performer' },
  { value: 'host', label: 'Host' },
  { value: 'other', label: 'Other' },
]

/** Mirrors `EventLink['kind']` (lib/events/types.ts). */
const LINK_KINDS: readonly FieldOption[] = [
  { value: 'tickets', label: 'Tickets' },
  { value: 'rsvp', label: 'RSVP' },
  { value: 'website', label: 'Website' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'other', label: 'Other' },
]

/** Render a scalar as display text. Mirrors the kernel's own reader. PURE + total. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** Join a string array for display. The kernel's own reader renders arrays as empty, so every
 *  list-shaped field (tags, features, sponsors) needs this. PURE + total. */
function list(v: unknown): string {
  if (!Array.isArray(v)) return ''
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).join(', ')
}

/** Whole cents as plain money ("$25", "$12.50"). Empty when there is no usable number. PURE. */
function money(cents: unknown): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return ''
  const dollars = cents / 100
  return `$${Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2)}`
}

export const EVENT_MANIFEST: EntityManifest = {
  entity: 'event',
  label: 'Event',

  // No provenance ledger: the host is the source. See the header note.
  verify: 'none',

  // Two doors, both already built: paste the write-up (Eventbrite, a group thread, a website)
  // and/or photograph the flyer, which the vision scan reads (app/(main)/events/scan).
  accepts: ['paste', 'image'],

  // Pick a mood for the page, steer the draft with plain directions.
  steer: { mood: true, directions: true },

  sections: [
    { key: 'identity', title: 'Identity', desc: 'The name, the kind of gathering, and the cover people see first.' },
    { key: 'story', title: 'What it is', desc: 'The description on the page. Vera drafts it, you keep or rewrite it.' },
    { key: 'when', title: 'When', desc: 'Start, end, and whether it repeats.' },
    { key: 'where', title: 'Where', desc: 'The venue and address we put on the map, or the link for an online event.' },
    { key: 'tickets', title: 'Tickets and price', desc: 'Free or paid, plus every tier printed on the flyer.' },
    { key: 'lineup', title: 'Lineup and schedule', desc: 'Who is on, and what happens when.' },
    { key: 'host', title: 'Host and links', desc: 'Who is running it, and the links people follow to book or find out more.' },
    { key: 'settings', title: 'Reach and size', desc: 'Where the event lives, who can see it, and how many people fit.' },
    { key: 'other', title: 'Other', desc: 'Anything on the flyer that does not fit a standard section.' },
  ],

  fields: [
    // ── Identity. The title is both the page's headline and the one thing creation cannot
    //    do without, so it is inline content AND always asked (required implies the Spark). ──
    { path: 'title', label: 'Title', kind: 'text', section: 'identity', placement: 'inline', required: true },
    // Derived from the title at create, renamed in the rail after (a rename redirects the page).
    { path: 'slug', label: 'Permalink', kind: 'slug', section: 'identity', omitWhenEmpty: true, veraDrafts: false },
    // Category defaults to 'gathering' when the draft leaves it unset (the create form's default).
    { path: 'category', label: 'Kind of gathering', kind: 'select', section: 'identity', options: CATEGORY_OPTIONS, read: (d) => str(d.category) || 'gathering' },
    { path: 'domain', label: 'Domain', kind: 'select', section: 'identity', options: DOMAINS, veraDrafts: true, omitWhenEmpty: true },
    { path: 'tags', label: 'Tags', kind: 'tags', section: 'identity', veraDrafts: true, omitWhenEmpty: true, read: (d) => list(d.tags) },
    // The poster itself: the hero on the page and the first item in the gallery.
    { path: 'coverImagePath', label: 'Cover image', kind: 'image', section: 'identity', placement: 'inline', omitWhenEmpty: true },
    {
      path: 'galleryImagePaths',
      label: 'More photos',
      kind: 'images',
      section: 'identity',
      placement: 'inline',
      omitWhenEmpty: true,
      read: (d) => {
        const n = Array.isArray(d.galleryImagePaths) ? d.galleryImagePaths.length : 0
        return n ? `${n} ${n === 1 ? 'photo' : 'photos'}` : ''
      },
    },

    // ── What it is (prose: Vera's words until the host keeps or rewrites them) ──
    { path: 'description', label: 'Description', kind: 'longtext', section: 'story', placement: 'inline', prose: true, veraDrafts: true },
    { path: 'details.features', label: 'What is included', kind: 'tags', section: 'story', veraDrafts: true, omitWhenEmpty: true, read: (d) => list((d.details as Record<string, unknown> | undefined)?.features) },

    // ── When. The start is the second thing Vera cannot invent, so the Spark asks it. ──
    // Wall-clock date AND time: `datetime`, not `date`. An event start without a time of day is
    // useless, and this pairing is what prompted the kind to be added to the kernel (ADR-597).
    // Asked at creation, edited in the rail after (ADR-1281), and required AT PUBLISH rather than
    // at the create (ADR-1280). A start is a fact about the gathering, never page content, so the
    // settings rail carries it. A flyer scan saves a draft-status Event before anyone has read the
    // date off the poster, and that draft is a real create the governed layer records: the Spark
    // still always asks for a start, the Event builder still refuses a live event without one, and
    // `publishDraft` enforces the full manifest before a draft goes live. Only the draft insert defers.
    { path: 'startsAt', label: 'Starts', kind: 'datetime', section: 'when', placement: 'spark', required: true, requiredAt: 'publish', editPlane: 'rail' },
    { path: 'endsAt', label: 'Ends', kind: 'datetime', section: 'when', omitWhenEmpty: true },
    // Repeats default to a one-time event; the cadence re-materialises the occurrence window on save.
    // A `select`, not a `cadence`: this is a closed set the server re-validates, and only a kind
    // in CHOICE_KINDS may declare its options. `cadence` stays for the genuinely free-text case.
    // ONE field for the whole Repeats question (ADR-1299): the cadence, the interval, the weekdays,
    // the monthly ordinal and the end. It was a `select` over four values plus a separate
    // "Repeats until" date, which between them could not say "every other Wednesday" and could
    // contradict each other once edited apart. The value is an RFC 5545 RRULE
    // (lib/events/repeat-rule.ts); the server splits the end back into `recurrence_until` and
    // derives the coarse `recurrence_type` mirror, so the manifest declares neither.
    { path: 'recurrenceRule', label: 'Repeat event', kind: 'repeat', section: 'when', omitWhenEmpty: true, veraDrafts: false, read: (d) => describeRepeat(parseRepeat(str(d.recurrenceRule)), str(d.startsAt)) },
    // The venue's IANA zone. Seeded from the creator, then refined from the geocoded point. A
    // `select` over the curated list (ADR-1281): every surface that ever edited it offered the
    // list, never a bare zone string, and the kit keeps a stored off-list zone selectable.
    { path: 'timeZone', label: 'Time zone', kind: 'select', section: 'when', options: COMMON_TIME_ZONES, veraDrafts: false, read: (d) => str(d.timeZone) || HOME_TIME_ZONE },

    // ── Where. The one-line place is what the Spark asks and what the geocoder falls back to. ──
    // The one-line place is edited in the rail after creation too (ADR-1281): the public page
    // prints it and the Maps link reads it, and a venue pick recomposes it.
    { path: 'location', label: 'Place', kind: 'place', section: 'where', placement: 'spark', editPlane: 'rail' },
    { path: 'attendanceMode', label: 'How people attend', kind: 'select', section: 'where', options: ATTENDANCE_OPTIONS, read: (d) => str(d.attendanceMode) || 'in_person' },
    { path: 'onlineUrl', label: 'Join link', kind: 'url', section: 'where', omitWhenEmpty: true },
    // The structured address, one field per persisted column, because each is separately
    // supplied and separately keyed. Together they resolve the event's point on the map.
    { path: 'venueName', label: 'Venue', kind: 'text', section: 'where', omitWhenEmpty: true },
    { path: 'street', label: 'Street', kind: 'text', section: 'where', omitWhenEmpty: true },
    { path: 'city', label: 'City', kind: 'text', section: 'where', omitWhenEmpty: true },
    { path: 'region', label: 'State or province', kind: 'text', section: 'where', omitWhenEmpty: true },
    { path: 'postalCode', label: 'Postal code', kind: 'text', section: 'where', omitWhenEmpty: true },
    { path: 'country', label: 'Country', kind: 'text', section: 'where', omitWhenEmpty: true },
    // Hidden address (ADR-825), `events.hide_address`: people browsing see the city only until
    // they RSVP or hold a ticket. The rail persisted it without declaring it until ADR-1281.
    { path: 'hideAddress', label: 'Hide the address until someone registers', kind: 'toggle', section: 'where', veraDrafts: false },

    // ── Tickets and price. Both asked in the Spark: a flyer without a price is a real gap,
    //    and nobody but the host can settle it. Not `commercial` (no ledger, host is the source). ──
    { path: 'isFree', label: 'Free to attend', kind: 'toggle', section: 'tickets', placement: 'spark', read: (d) => (d.isFree ? 'Yes' : 'No') },
    {
      path: 'priceCents',
      label: 'Price',
      kind: 'price',
      section: 'tickets',
      placement: 'spark',
      // Edited in the rail after creation (ADR-1281); an emptied price is a free RSVP event.
      editPlane: 'rail',
      omitWhenEmpty: true,
      read: (d) => (d.isFree ? 'Free' : money(d.priceCents)),
    },
    // The three the settings rail persisted without declaring until ADR-1281. The join mode is
    // its own column; the RSVP window is the real persisted path inside `events.details`, so the
    // row a board shows and the key the action writes are the same string (ADR-992).
    { path: 'joinMode', label: 'How people join', kind: 'select', section: 'tickets', options: JOIN_MODE_OPTIONS, veraDrafts: false, read: (d) => str(d.joinMode) || 'auto' },
    { path: 'details.rsvpWindow.opensAt', label: 'RSVPs open', kind: 'datetime', section: 'tickets', veraDrafts: false, omitWhenEmpty: true },
    { path: 'details.rsvpWindow.closesAt', label: 'RSVPs close', kind: 'datetime', section: 'tickets', veraDrafts: false, omitWhenEmpty: true },

    // ── Lineup and schedule: the flat list; the acts and set times are repeats below. ──
    { path: 'details.sponsors', label: 'Sponsors', kind: 'tags', section: 'lineup', omitWhenEmpty: true, read: (d) => list((d.details as Record<string, unknown> | undefined)?.sponsors) },

    // ── Host. Who is running it, as printed. ──
    { path: 'organizerName', label: 'Host', kind: 'text', section: 'host', omitWhenEmpty: true },
    { path: 'organizerContact', label: 'How to reach the host', kind: 'text', section: 'host', omitWhenEmpty: true },

    // ── Reach and size. The author's own calls, never Vera's: where an event lives and who
    //    can see it are trust decisions. Capacity is the only real scarcity signal. ──
    // A real foreign key, not a closed set: the rows are the author's own circles, so the
    // surface loads them. The create form's `__public__` sentinel (a standalone local event,
    // which is what `scopeType: 'public'` is derived from) is the collection's own first row,
    // supplied by the page rather than declared here.
    { path: 'scopeId', label: 'Where it lives', kind: 'reference', section: 'settings', optionsFrom: 'circles', veraDrafts: false },
    { path: 'visibility', label: 'Who can see it', kind: 'select', section: 'settings', options: VISIBILITY_OPTIONS, veraDrafts: false, read: (d) => str(d.visibility) || 'circle_only' },
    { path: 'capacity', label: 'Group size', kind: 'number', section: 'settings', omitWhenEmpty: true },
    { path: 'energyTag', label: 'Energy', kind: 'select', section: 'settings', options: ENERGY_OPTIONS, omitWhenEmpty: true },
    // Three switches the settings rail persisted without declaring until ADR-1281. Approval is a
    // column (`rsvp_requires_approval`); the other two live in the `events.theme` bag beside the
    // cover focus, read and written by their own pure helpers, and their labels are those helpers'.
    { path: 'rsvpRequiresApproval', label: 'Approve each person before they are in', kind: 'toggle', section: 'settings', veraDrafts: false },
    { path: 'checkInEnabled', label: CHECK_IN_LABEL, kind: 'toggle', section: 'settings', veraDrafts: false },
    { path: 'marketListed', label: MARKET_LISTING_LABEL, kind: 'toggle', section: 'settings', veraDrafts: false },
  ],

  // The flyer's repeated collections. Each item expands into its own rows, so a tier's price
  // or a link's URL is reviewed and corrected on its own, never as one lump.
  repeats: [
    {
      arrayPath: 'details.tickets',
      section: 'tickets',
      itemLabel: (item, index) => str(item.label) || `Tier ${index + 1}`,
      fields: [
        { path: 'label', label: 'tier', kind: 'text' },
        { path: 'priceCents', label: 'price', kind: 'price', read: (t) => money(t.priceCents) },
        { path: 'note', label: 'note', kind: 'text', omitWhenEmpty: true },
      ],
    },
    {
      arrayPath: 'details.lineup',
      section: 'lineup',
      itemLabel: (item, index) => str(item.name) || `Act ${index + 1}`,
      fields: [
        { path: 'name', label: 'name', kind: 'text' },
        { path: 'role', label: 'role', kind: 'select', options: LINEUP_ROLES },
        { path: 'note', label: 'note', kind: 'text', omitWhenEmpty: true },
      ],
    },
    {
      arrayPath: 'details.schedule',
      section: 'lineup',
      itemLabel: (item, index) => str(item.title) || str(item.time) || `Slot ${index + 1}`,
      fields: [
        { path: 'time', label: 'time', kind: 'text', omitWhenEmpty: true },
        { path: 'title', label: 'what happens', kind: 'text' },
        { path: 'note', label: 'note', kind: 'text', omitWhenEmpty: true },
      ],
    },
    {
      arrayPath: 'details.links',
      section: 'host',
      itemLabel: (item, index) => str(item.label) || str(item.kind) || `Link ${index + 1}`,
      fields: [
        { path: 'label', label: 'label', kind: 'text' },
        { path: 'url', label: 'link', kind: 'url' },
        { path: 'kind', label: 'kind', kind: 'select', options: LINK_KINDS },
      ],
    },
    {
      arrayPath: 'details.other',
      section: 'other',
      itemLabel: (item, index) => str(item.label) || `Detail ${index + 1}`,
      fields: [
        { path: 'label', label: 'label', kind: 'text' },
        { path: 'value', label: 'value', kind: 'text' },
      ],
    },
  ],
}

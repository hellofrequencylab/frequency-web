import 'server-only'

// THE FUNCTION-AWARE BLOCK DATA SOURCE REGISTRY (rail editor foundation). ONE typed map from a
// function-backed entity-block type (lib/entity-blocks/registry.ts) to the three reads the upcoming
// block editor needs, so the editor can be honest about a Space's real state:
//
//   • item 6 — "don't show a function unless it exists": `exists(spaceId)` (a per-block capability check)
//     + `spaceEnabledFunctions(spaceId)` (the whole enabled set) tell the palette which function-backed
//     blocks to offer. A block whose function is turned off in spaces.entitlements is hidden.
//   • item 7 — "any function that exists should have pre-populated data": `list(spaceId)` returns the
//     function's live items as plain `{ id, label }` rows the block render seeds from.
//   • item 5 — function-specific block settings: `list(spaceId)` also feeds the edit panel's picker, and
//     `createHref(slug)` is the admin route to create the FIRST item when the list is empty.
//
// REUSE, NOT REINVENT. Every read delegates to an EXISTING, already-tenanted, already-fail-safe reader:
//   - capability     → lib/spaces/functions.ts (spaceFunctionEnabled + SPACE_FUNCTIONS), fed the Space's
//                       own entitlements blob via lib/spaces/store.ts getSpaceById.
//   - list()         → the SAME readers the live profile render uses (lib/spaces/content-data.ts,
//                       lib/spaces/memberships|tickets|donations|enroll.ts, lib/spaces/profile-data.ts),
//                       so a block's picker never disagrees with what the section actually renders.
//   - createHref()   → lib/spaces/surface-hrefs.ts hrefForSurface (the ONE admin-route map the /manage
//                       console + rail resolve from), so a route change lands here for free.
//
// TENANCY + SAFETY. Every read is BOUND to the passed spaceId (the underlying readers filter space_id /
// read the one Space row); this module NEVER mutates. AUTHORIZATION is the CALLER's job — this is a
// scoped reader the editor calls AFTER it has gated the viewer to owner/admin. FAIL-SAFE is the contract:
// a reader that throws, a missing Space, or an unknown block type yields `false` / `[]` / a best-effort
// href, so the editor degrades to "no data" instead of crashing. Server-only (the readers need the
// service-role admin client), so importing this into a client bundle fails loudly at build.

import { getSpaceById } from '@/lib/spaces/store'
import type { Space } from '@/lib/spaces/types'
import {
  SPACE_FUNCTIONS,
  spaceFunctionDef,
  spaceFunctionEnabled,
  type SpaceFunctionKey,
} from '@/lib/spaces/functions'
import { hrefForSurface } from '@/lib/spaces/surface-hrefs'
import { readProfileData, isServiceListed, formatServicePrice } from '@/lib/spaces/profile-data'
import {
  getSpaceUpcomingEvents,
  getSpaceTeam,
  getSpaceReviews,
  getSpaceFaqs,
  getSpaceUpdates,
  getSpacePractices,
  getSpaceCommunity,
} from '@/lib/spaces/content-data'
import { listMembershipTiers } from '@/lib/spaces/memberships'
import { listTicketTiers } from '@/lib/spaces/tickets'
import { getDonationAsk } from '@/lib/spaces/donations'
import { getSpaceProgram } from '@/lib/spaces/enroll'

// ── The row shape a picker + a pre-populated render read ────────────────────────────────────────────

/** One item a function exposes to a block: a stable `id` (for the picker's value + de-dupe) and a plain
 *  `label` (the human name shown in the picker and seeded into the block). `href` is an OPTIONAL deep
 *  link to that one item's live page (present where an item has its own route: an event, a circle),
 *  absent for a jsonb-blob item (an offering, a membership tier) that has no standalone page. Additive
 *  fields a block wants (a count, an image) can ride a later widening; keep the core two stable. */
export interface BlockDataItem {
  id: string
  label: string
  href?: string
  /** OPTIONAL display extras a rich block (the Features highlight engine, ADR-585) shows when it sources its
   *  items from this function: a one-line blurb, a formatted price label, and a thumbnail image. Each is
   *  present only when the underlying item has it; absent for a source that carries none (e.g. tickets have no
   *  price). A picker never needs these, so they stay optional + additive. */
  blurb?: string
  price?: string
  image?: string
}

// ── The source contract each function-backed block implements ───────────────────────────────────────

/** A function-backed block's data source: the three reads the editor needs. Every method is FAIL-SAFE
 *  (never throws into the caller) and BOUND to `spaceId`. `createHref` is pure (route only). */
export interface BlockDataSource {
  /** The block type id in the unified registry (lib/entity-blocks/registry.ts). */
  block: string
  /**
   * The SpaceFunctionKey whose on/off switch gates this block, or null for a block backed by data that
   * has no toggleable function (events/reviews/faq/updates/practices/circles/offerings — always
   * available; their "exists" is purely "are there rows"). Drives `spaceEnabledFunctions` membership.
   */
  functionKey: SpaceFunctionKey | null
  /**
   * Does this function EXIST for the Space? item 6's gate. TRUE iff the function's switch is ON (a
   * function-keyed block) AND — where the block should hide when empty — there is at least one item.
   * A function whose switch is OFF is never "exists". FAIL-SAFE: false on any error.
   */
  exists: (spaceId: string) => Promise<boolean>
  /**
   * The function's live items as `{ id, label }`, for the edit-panel picker AND to pre-populate the
   * block render (items 5 + 7). FAIL-SAFE: [] on any error / empty function.
   */
  list: (spaceId: string) => Promise<BlockDataItem[]>
  /**
   * The admin route to create the FIRST item, given the Space slug (item 5's empty-state link). Reuses
   * the ONE admin-route map (surface-hrefs). Never null: falls back to the Space's manage console.
   */
  createHref: (slug: string) => string
  /**
   * The empty-state create-link COPY (item 5), e.g. "Create an offering". Voice-canon (no em dashes), a[n]
   * chosen per source so the link reads naturally. Falls back to a generic "Create the first one".
   */
  createLabel: string
}

// ── Shared helpers (fail-safe Space read + a switch check) ──────────────────────────────────────────

/** The Space row (entitlements + preferences + slug), or null on any error. The capability + offerings
 *  reads run off this ONE row. FAIL-SAFE. */
async function loadSpace(spaceId: string): Promise<Space | null> {
  try {
    return await getSpaceById(spaceId)
  } catch {
    return null
  }
}

/** Is a function's on/off switch ON for a Space? Reads the Space's entitlements blob through the PURE
 *  resolver (default-ON; only an explicit `false` disables). FAIL-SAFE: false on any error / unknown fn
 *  / missing Space. A null `fn` means "no function gates this block" → always ON (the block gates on
 *  rows alone). */
async function functionSwitchOn(spaceId: string, fn: SpaceFunctionKey | null): Promise<boolean> {
  if (fn === null) return true
  const def = spaceFunctionDef(fn)
  if (!def) return false
  const space = await loadSpace(spaceId)
  if (!space) return false
  return spaceFunctionEnabled(space, def)
}

/** The admin route for a module id, or the Space's /manage console as a never-null fallback. Reuses the
 *  ONE surface-href map (a route change there flows here for free). PURE. */
function moduleHref(moduleId: string, slug: string): string {
  return hrefForSurface(moduleId, slug) ?? `/spaces/${slug}/manage`
}

/** Wrap a list-reader so it can never throw into a caller (defense in depth: the underlying readers are
 *  already fail-safe, but a mapping error here must not escape). */
async function safeList(read: () => Promise<BlockDataItem[]>): Promise<BlockDataItem[]> {
  try {
    return await read()
  } catch {
    return []
  }
}

// ── The per-block list readers (each reuses an existing profile-render reader) ───────────────────────

/** Offerings: the listed storefront services off spaces.preferences.profileData (the SAME source the
 *  Offerings section renders — readProfileData + isServiceListed). Items are jsonb rows with no id, so
 *  the title doubles as a stable id (de-duped by the editor if needed). No standalone item href. */
async function listOfferings(spaceId: string): Promise<BlockDataItem[]> {
  const space = await loadSpace(spaceId)
  if (!space) return []
  const offerings = (readProfileData(space.preferences).offerings ?? []).filter(isServiceListed)
  return offerings
    .filter((o) => Boolean(o.title?.trim()))
    .map((o) => {
      const title = o.title.trim()
      // The Features highlight engine (ADR-585) shows the offering's blurb + price; the picker ignores them.
      const item: BlockDataItem = { id: title, label: title }
      if (o.blurb?.trim()) item.blurb = o.blurb.trim()
      const price = formatServicePrice(o)
      if (price) item.price = price
      return item
    })
}

async function listEvents(spaceId: string): Promise<BlockDataItem[]> {
  const events = await getSpaceUpcomingEvents(spaceId)
  return events.map((e) => ({ id: e.id, label: e.title, href: `/events/${e.slug}` }))
}

async function listTeam(spaceId: string): Promise<BlockDataItem[]> {
  const team = await getSpaceTeam(spaceId)
  return team.map((m) => ({
    id: m.profileId,
    label: m.name,
    href: m.handle ? `/people/${m.handle}` : undefined,
  }))
}

/** A membership tier's display price for the Features engine (ADR-585): "$20/mo", "$200/yr", "$50", or ''
 *  for a free tier. priceCents is DISPLAY ONLY in v1 (no billing). */
function membershipPriceLabel(priceCents: number, interval: 'month' | 'year' | 'once'): string {
  if (!priceCents || priceCents <= 0) return ''
  const dollars = priceCents / 100
  const amount = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  return interval === 'month' ? `${amount}/mo` : interval === 'year' ? `${amount}/yr` : amount
}

async function listMemberships(spaceId: string): Promise<BlockDataItem[]> {
  const tiers = await listMembershipTiers(spaceId)
  return tiers
    .filter((t) => Boolean(t.id))
    .map((t) => {
      const item: BlockDataItem = { id: t.id as string, label: t.name }
      if (t.description?.trim()) item.blurb = t.description.trim()
      const price = membershipPriceLabel(t.priceCents, t.interval)
      if (price) item.price = price
      return item
    })
}

async function listTickets(spaceId: string): Promise<BlockDataItem[]> {
  const tiers = await listTicketTiers(spaceId)
  return tiers
    .filter((t) => Boolean(t.id))
    .map((t) => ({ id: t.id as string, label: t.name }))
}

/** Donations: the single active ask (there is one fund per Space), as a one-row list so the picker /
 *  render treat it uniformly. Empty when no active ask. */
async function listDonations(spaceId: string): Promise<BlockDataItem[]> {
  const ask = await getDonationAsk(spaceId)
  if (!ask) return []
  return [{ id: ask.id ?? 'donation', label: ask.fundLabel }]
}

/** Enrollment: the single published program (there is one program per Space), as a one-row list. */
async function listEnroll(spaceId: string): Promise<BlockDataItem[]> {
  const program = await getSpaceProgram(spaceId)
  if (!program) return []
  return [{ id: program.id ?? 'program', label: program.name }]
}

async function listReviews(spaceId: string): Promise<BlockDataItem[]> {
  const reviews = await getSpaceReviews(spaceId)
  return reviews.latest.map((r) => ({
    id: r.id,
    label: r.author?.displayName ? `${r.author.displayName} (${r.rating}/5)` : `${r.rating}/5`,
  }))
}

async function listFaqs(spaceId: string): Promise<BlockDataItem[]> {
  const faqs = await getSpaceFaqs(spaceId)
  return faqs.map((f) => ({ id: f.id, label: f.question }))
}

async function listUpdates(spaceId: string): Promise<BlockDataItem[]> {
  const updates = await getSpaceUpdates(spaceId)
  return updates.map((u) => ({ id: u.id, label: u.title }))
}

async function listPractices(spaceId: string): Promise<BlockDataItem[]> {
  const data = await getSpacePractices(spaceId)
  return [...data.practices, ...data.journeys].map((p) => ({
    id: p.id,
    label: p.title,
    href: p.kind === 'journey' ? `/journeys/${p.slug}` : `/practices/${p.slug}`,
  }))
}

async function listJourneys(spaceId: string): Promise<BlockDataItem[]> {
  const data = await getSpacePractices(spaceId)
  return data.journeys.map((j) => ({ id: j.id, label: j.title, href: `/journeys/${j.slug}` }))
}

async function listCircles(spaceId: string): Promise<BlockDataItem[]> {
  const circles = await getSpaceCommunity(spaceId)
  return circles.map((c) => ({ id: c.id, label: c.name, href: `/circles/${c.slug}` }))
}

// ── A tiny builder so every source is uniform + fail-safe by construction ────────────────────────────

/** Build a source. `exists` = the switch is ON AND (when `requireRows`) the list is non-empty. Most
 *  blocks require rows (item 6 hides an empty section); a couple gate on the switch alone. */
function source(spec: {
  block: string
  functionKey: SpaceFunctionKey | null
  moduleId: string
  list: (spaceId: string) => Promise<BlockDataItem[]>
  /** The empty-state create-link copy (item 5), e.g. "Create an offering". */
  createLabel: string
  /** When true, `exists` also requires at least one item (default true). */
  requireRows?: boolean
}): BlockDataSource {
  const requireRows = spec.requireRows ?? true
  const list = (spaceId: string) => safeList(() => spec.list(spaceId))
  return {
    block: spec.block,
    functionKey: spec.functionKey,
    list,
    createHref: (slug: string) => moduleHref(spec.moduleId, slug),
    createLabel: spec.createLabel,
    exists: async (spaceId: string) => {
      try {
        const on = await functionSwitchOn(spaceId, spec.functionKey)
        if (!on) return false
        if (!requireRows) return true
        const items = await list(spaceId)
        return items.length > 0
      } catch {
        return false
      }
    },
  }
}

// ── THE REGISTRY (block type → data source) ─────────────────────────────────────────────────────────
//
// Only the FUNCTION-BACKED data blocks appear here (a block whose content is the Space's live function
// data). Authored content blocks (heading/text/image/gallery/callout/...) and the design blocks carry
// no function data, so they are absent — the editor offers them unconditionally.
//
// The `moduleId` on each row is a SPACE_MODULES id (lib/admin/modules/space-modules.ts), resolved to a
// route through surface-hrefs — never a hardcoded path.

const SOURCES: readonly BlockDataSource[] = [
  // Offerings → the storefront services blob. Always available (no toggleable function); hides when the
  // catalog is empty. Create the first item on the Store editor.
  source({ block: 'offerings', functionKey: null, moduleId: 'space.services', list: listOfferings, createLabel: 'Create an offering' }),

  // Booking → the `availability` function. Its data-block already declares requiresFunction:'availability'
  // in the registry; here we gate on the switch AND on published availability (a booking picker lists the
  // bookable service items = the listed offerings, since booking runs against them).
  source({ block: 'booking', functionKey: 'availability', moduleId: 'space.booking', list: listOfferings, createLabel: 'Set up booking' }),

  // Events → the Space's upcoming events. No function toggle (events are universal); hides when none.
  source({ block: 'events', functionKey: null, moduleId: 'space.layout', list: listEvents, createLabel: 'Create an event' }),

  // Team → the `members` function (the block already declares requiresFunction:'members'). Lists the
  // Space's role-holding team; create/manage members on the Members surface.
  source({ block: 'team', functionKey: 'members', moduleId: 'space.people', list: listTeam, createLabel: 'Add a team member' }),

  // Journeys → the Space's hosted journey plans. No function toggle; hides when none.
  source({ block: 'journeys', functionKey: null, moduleId: 'space.layout', list: listJourneys, createLabel: 'Add a journey' }),

  // Practices → the Space's practices + journeys. No function toggle; hides when none.
  source({ block: 'practices', functionKey: null, moduleId: 'space.layout', list: listPractices, createLabel: 'Add a practice' }),

  // Circles → the Space's active community circles. No function toggle; hides when none.
  source({ block: 'circles', functionKey: null, moduleId: 'space.layout', list: listCircles, createLabel: 'Create a circle' }),

  // Reviews → the Space's visible reviews. No function toggle; hides when none.
  source({ block: 'reviews', functionKey: null, moduleId: 'space.layout', list: listReviews, createLabel: 'Manage reviews' }),

  // FAQ → the operator FAQ rows. No function toggle; hides when none.
  source({ block: 'faq', functionKey: null, moduleId: 'space.basics', list: listFaqs, createLabel: 'Add a question' }),

  // Updates → the published brand updates. No function toggle; hides when none.
  source({ block: 'updates', functionKey: null, moduleId: 'space.layout', list: listUpdates, createLabel: 'Post an update' }),

  // The commerce services that are NOT their own entity block today but expose their items for a picker
  // (item 5) so a future block / a settings picker can reuse them. Each gates on its function switch AND
  // its rows. Keyed by a synthetic block id matching the SpaceFunctionKey (there is no registry block yet).
  source({ block: 'memberships', functionKey: 'memberships', moduleId: 'space.memberships', list: listMemberships, createLabel: 'Create a membership' }),
  source({ block: 'tickets', functionKey: 'tickets', moduleId: 'space.tickets', list: listTickets, createLabel: 'Create a ticket' }),
  source({ block: 'donations', functionKey: 'donations', moduleId: 'space.donations', list: listDonations, createLabel: 'Set up donations' }),
  source({ block: 'enroll', functionKey: 'enroll', moduleId: 'space.enroll', list: listEnroll, createLabel: 'Publish a program' }),
]

/** Fast lookup by block type. */
const SOURCE_BY_BLOCK: Record<string, BlockDataSource> = Object.fromEntries(
  SOURCES.map((s) => [s.block, s]),
)

// ── Public API ──────────────────────────────────────────────────────────────────────────────────────

/** Every block type that has a function-backed data source (the ones the editor gates + pre-populates).
 *  Authored content + design blocks are NOT here. */
export const FUNCTION_BACKED_BLOCK_TYPES: readonly string[] = SOURCES.map((s) => s.block)

/** Is this block type function-backed (does it have a data source)? Pure. */
export function isFunctionBackedBlock(block: string): boolean {
  return block in SOURCE_BY_BLOCK
}

/** The data source for a block type, or null when the block is not function-backed (an authored /
 *  design block). Pure. */
export function blockDataSource(block: string): BlockDataSource | null {
  return SOURCE_BY_BLOCK[block] ?? null
}

/**
 * Does a function-backed block have data to show for this Space? item 6's per-block gate: the editor
 * calls this to decide whether to OFFER the block in the palette. A non-function-backed block (no
 * source) is always "true" here (the editor offers it unconditionally). FAIL-SAFE: false on any error.
 */
export async function blockExists(block: string, spaceId: string): Promise<boolean> {
  const src = blockDataSource(block)
  if (!src) return true
  return src.exists(spaceId)
}

/**
 * The live items for a function-backed block, as `{ id, label }` rows for the edit-panel picker AND to
 * pre-populate the block render (items 5 + 7). [] for a non-function-backed block or any error.
 */
export async function blockDataList(block: string, spaceId: string): Promise<BlockDataItem[]> {
  const src = blockDataSource(block)
  if (!src) return []
  return src.list(spaceId)
}

/**
 * The admin route to create the FIRST item for a function-backed block (item 5's empty-state link), or
 * null for a non-function-backed block. Reuses the ONE admin-route map. Pure (route only).
 */
export function blockCreateHref(block: string, slug: string): string | null {
  const src = blockDataSource(block)
  if (!src) return null
  return src.createHref(slug)
}

/**
 * The empty-state create-link COPY for a function-backed block (item 5), e.g. "Create an offering", or null
 * for a non-function-backed block. Pure.
 */
export function blockCreateLabel(block: string): string | null {
  const src = blockDataSource(block)
  if (!src) return null
  return src.createLabel
}

/** One block's serializable picker payload (item 5): the Space's live items + the create link the editor
 *  shows when the list is empty. Plain data, safe to cross the RSC boundary into the client editor. */
export interface BlockPickerData {
  items: BlockDataItem[]
  createHref: string
  createLabel: string
}

/**
 * Resolve the edit-panel PICKER payload (item 5) for a set of function-backed blocks in ONE pass, bound to
 * the Space. Returns a map keyed by block id: each block's live items (blockDataList) + its create link, so
 * the client editor can render the picker (a checklist of the Space's real items) or, when empty, the
 * "Create ..." link. A non-function-backed / unknown id is skipped. FAIL-SAFE: a reader that throws yields
 * that block's entry with an empty item list (the editor then shows the create link), never a crash.
 *
 * TENANCY: every read is bound to `spaceId` (the underlying readers filter space_id); AUTHORIZATION is the
 * CALLER's job — call this only AFTER gating the viewer to owner/admin (the rail getter does). Server-only.
 */
export async function spaceBlockPickerData(
  spaceId: string,
  slug: string,
  blocks: readonly string[],
): Promise<Record<string, BlockPickerData>> {
  const out: Record<string, BlockPickerData> = {}
  await Promise.all(
    blocks.map(async (block) => {
      const src = blockDataSource(block)
      if (!src) return
      const items = await src.list(spaceId) // already fail-safe (safeList) → [] on error
      out[block] = { items, createHref: src.createHref(slug), createLabel: src.createLabel }
    }),
  )
  return out
}

/**
 * THE PER-BLOCK PALETTE GATE (item 6). The set of function-backed block ids that EXIST for a Space — the
 * function's switch is on AND (where the source requires rows) it has at least one item. The palette LOCKS a
 * function-backed block whose id is NOT in this set, so a Space never sees an Offerings block with no
 * offerings or a Team block with no team. A block with no data source is not function-backed and is never in
 * this set (the caller offers those unconditionally). Reads run in parallel; each `exists` is fail-safe, so a
 * transient miss simply omits that block (it stays locked rather than crashing the palette). Server-only.
 */
export async function existingFunctionBackedBlocks(spaceId: string): Promise<Set<string>> {
  const entries = await Promise.all(
    SOURCES.map(async (s) => [s.block, await s.exists(spaceId)] as const),
  )
  return new Set(entries.filter(([, ok]) => ok).map(([block]) => block))
}

/**
 * THE PALETTE GATE (item 6). The set of SpaceFunctionKey values whose function EXISTS for a Space — a
 * function is "enabled" when its on/off switch is ON in spaces.entitlements. The palette hides a
 * function-backed block whose key is NOT in this set. Reads the Space's entitlements ONCE (fail-safe to
 * every function's default-ON when the Space cannot be read, so a transient read miss never strands the
 * whole palette). Returns a Set for O(1) membership.
 *
 * Note this is the SWITCH set (item 6 "unless it exists" = the function is turned on), independent of
 * whether a given block currently has ROWS — that finer per-block check is `blockExists`. The two
 * compose: hide a block when its function is off (this) OR it has no data (blockExists requireRows).
 */
export async function spaceEnabledFunctions(spaceId: string): Promise<Set<SpaceFunctionKey>> {
  const space = await loadSpace(spaceId)
  const enabled = new Set<SpaceFunctionKey>()
  for (const fn of SPACE_FUNCTIONS) {
    // Missing Space → default-ON (spaceFunctionEnabled(null, fn) is true), so the palette stays permissive
    // on a transient miss rather than hiding every function.
    if (spaceFunctionEnabled(space, fn)) enabled.add(fn.key)
  }
  return enabled
}

// ── The Features highlight-engine source resolver (ADR-585) ───────────────────────────────────────────

/** One item the Features block renders when it sources from a Space DATA source. The shape matches the
 *  renderer's item bag (content-block-view readFeatureItems): a title + text + optional price + link + CTA
 *  label. Plain data, safe to inject into the content props that cross into the render. */
export interface FeatureSourceItem {
  title: string
  text: string
  price: string
  link: string
  cta: string
}

/** The Features `source` values that pull from a Space DATA source (everything but `custom`). Each value IS
 *  the data-source block id, so the resolver reads blockDataList(source) directly. */
const FEATURE_SOURCE_BLOCKS = ['offerings', 'events', 'memberships', 'tickets'] as const
type FeatureSourceBlock = (typeof FEATURE_SOURCE_BLOCKS)[number]

/** The CTA label a sourced item shows over its link, per source (voice canon, no em dashes). An item with no
 *  link shows no CTA regardless. */
const FEATURE_SOURCE_CTA: Record<FeatureSourceBlock, string> = {
  offerings: 'View',
  events: 'See event',
  memberships: 'Join',
  tickets: 'Get tickets',
}

/** Whether a Features `source` string names a resolvable Space DATA source. Pure. */
export function isFeatureSourceBlock(source: string): source is FeatureSourceBlock {
  return (FEATURE_SOURCE_BLOCKS as readonly string[]).includes(source)
}

/**
 * Resolve a Features block's DATA source (ADR-585) into render-ready items for a Space: the source's live
 * items (blockDataList, already fail-safe + tenant-bound) mapped to the Features item bag — title + blurb +
 * price + link + a source-appropriate CTA. `max` caps the count (the block is a highlight, not a full list).
 * Returns [] for `custom` / an unknown source / an empty function, so the render simply shows the header (or
 * nothing). AUTHORIZATION is the caller's job; this is a scoped reader. FAIL-SAFE, server-only.
 */
export async function resolveFeatureSourceItems(
  source: string,
  spaceId: string,
  max = 12,
): Promise<FeatureSourceItem[]> {
  if (!isFeatureSourceBlock(source)) return []
  const items = await blockDataList(source, spaceId)
  return items.slice(0, Math.max(0, max)).map((it) => ({
    title: it.label,
    text: it.blurb ?? '',
    price: it.price ?? '',
    link: it.href ?? '',
    cta: it.href ? FEATURE_SOURCE_CTA[source] : '',
  }))
}

import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { SITE_SCOPE } from '@/lib/layout/editable-content'

// THE COPY CASCADE — the ONE resolver for operator-editable page copy, inherited down the route
// tree (PROG-P6, ADR-1122, PAGE-FRAMEWORK §8.6).
//
// `page_content` (ADR-180/182) has always been keyed by the EXACT route string and read with
// `.eq('route', route)`. That is the whole of what this module changes: a route now resolves
// against its own row, then its ancestors' rows, then a reserved SITE row, then the coded
// fallback the page passes in. Nothing is written differently and no column is added — the rows
// that already exist in production become the section rung by being where they already are.
//
// ── WHY THIS IS WORTH A MODULE, MEASURED RATHER THAN ASSUMED (2026-08-25) ──────────────────────
//
// The production table was read before this was designed, and it does not hold what the row's
// title implies. SIX rows, all of them on SECTION ROOTS — `/circles`, `/events`, `/journeys`,
// `/nearby`, `/network`, `/practices`. Every one of the six sets `hero_image`. NOT ONE sets
// `title` or `description`. So the "copy" an operator has actually put into this table is a
// single field, the section hero, and it is stored at exactly the rung that a cascade would
// inherit FROM — while the reader only ever looked at the exact route.
//
// The consequence is visible today: `/events/hypnotic-sound`, `/practices/<id>` and
// `/circles/mindless` are all beneath a section whose operator picked a cover, and all of them
// resolve to nothing. The cascade is what makes six existing rows reach the pages under them.
//
// ── FIELD-LEVEL, NOT ROW-LEVEL. That is what makes it a cascade rather than a fallback ─────────
//
// A page that sets only `title` still inherits its section's hero. Each field walks the chain on
// its own and takes the first non-blank value. Which is exactly why each field needs a POLICY,
// below: inheriting is right for theme and wrong for identity.

/** The reserved SITE rung. Not a route — `page_content.route` is free text, and no router path can
 *  ever be `'*'`, so the site row cannot collide with a page row.
 *
 *  🔴 IT IS DELIBERATELY NOT `'/'`. The home page already owns the `'/'` row (it is in
 *  CONTENT_EDIT_ROUTES for its SEO title + meta description alone), so making `'/'` the site rung
 *  would quietly promote the home page's `<title>` to the default title of every page in the app.
 *  Production's `'/'`-row fields are empty today, so nothing would have broken visibly, which is
 *  precisely what makes it the expensive kind of mistake.
 *
 *  DECLARED in lib/layout/editable-content.ts since ADR-1284 and re-exported here, because this
 *  module is `server-only` and the operator editor (a client component) has to name the key to
 *  edit the site row. Every reader of the cascade keeps importing it from here. */
export { SITE_SCOPE }

/** PURE: the scope chain for a route, MOST SPECIFIC FIRST, always ending at the site rung.
 *
 *    '/network/friends/x' → ['/network/friends/x', '/network/friends', '/network', '*']
 *    '/events/calendar'   → ['/events/calendar', '/events', '*']
 *    '/events'            → ['/events', '*']
 *    '/'                  → ['/', '*']
 *
 *  Every ancestor SEGMENT is a rung, so a three-deep route inherits from both of its parents.
 *  `'/'` is never inserted as an ancestor — it appears only as its own page rung, for the reason
 *  `SITE_SCOPE` gives. A route that is not root-relative gets the site rung only, so a malformed
 *  key can never be spliced into the `.in()` list. */
export function routeScopeChain(route: string): string[] {
  if (!route.startsWith('/')) return [SITE_SCOPE]
  const path = route.length > 1 && route.endsWith('/') ? route.slice(0, -1) : route
  const chain: string[] = [path]
  const parts = path.split('/').filter(Boolean)
  for (let i = parts.length - 1; i > 0; i--) chain.push(`/${parts.slice(0, i).join('/')}`)
  chain.push(SITE_SCOPE)
  return chain
}

/** The prefix segment that matches ANY ONE route segment: `/spaces/_/podcasts` covers
 *  `/spaces/<any space>/podcasts`. `_` rather than `*` or `[slug]` because this is already the
 *  repo's placeholder for "every tenant's copy of this surface" — `page-chrome.ts` keys the Space
 *  CRM board's chrome override on `/spaces/_/crm` — and because `isSafeRoute` admits `_`, so a
 *  pattern prefix is still a legal `page_settings` route string.
 *
 *  It exists for the DYNAMIC segment a leading prefix cannot reach. A section whose dynamic part is
 *  at the END (`/practices/<id>`) is covered by its literal prefix; a section whose dynamic part is
 *  in the MIDDLE (`/spaces/<slug>/podcasts`) has no literal prefix that names the tab, and before
 *  this the only row that matched it was `/spaces` — one row for five different tabs. */
export const PREFIX_WILDCARD = '_'

/** PURE: the longest-prefix winner from a table of route-prefixed rows. `'/journeys/mine'` takes
 *  the `/journeys/mine` row over the `/journeys` row; `'/journeysabc'` takes neither.
 *
 *  Matching is SEGMENT-WISE (it always was, in effect — the old string form asked for `route ===
 *  prefix || route.startsWith(prefix + '/')`, which is the same question), so a `_` segment in a
 *  row's prefix can stand for any one route segment. Specificity is the number of prefix SEGMENTS,
 *  ties broken by FEWER wildcards, so a literal row always beats a pattern row that reaches the
 *  same depth. No row in this repo carried a `_` before 2026-09-08, so every existing table
 *  resolves exactly as it did (`content-cascade.test.ts` pins that).
 *
 *  Extracted here because `index-hero.ts` and `detail-hero.ts` each wrote this loop by hand, and a
 *  third copy was about to be written for this module. It is the ONE thing all three genuinely
 *  share — see the ADR on why the rest of their ladders are deliberately not shared. */
export function longestPrefixRow<T extends { prefix: string }>(route: string, rows: readonly T[]): T | null {
  const path = route.split('/')
  let best: T | null = null
  let bestScore = -1
  for (const row of rows) {
    const parts = row.prefix.split('/')
    if (parts.length > path.length) continue
    let wildcards = 0
    let matched = true
    for (let i = 0; i < parts.length; i++) {
      // i === 0 is the empty string before the leading slash, never a wildcard.
      if (i > 0 && parts[i] === PREFIX_WILDCARD) {
        // A wildcard matches one segment, and an EMPTY segment is not one: '/spaces//loom' and a
        // trailing '/spaces/' must not be handed a tenant row.
        if (!path[i]) { matched = false; break }
        wildcards++
        continue
      }
      if (parts[i] !== path[i]) { matched = false; break }
    }
    if (!matched) continue
    const score = parts.length * 10 - wildcards
    if (score > bestScore) {
      best = row
      bestScore = score
    }
  }
  return best
}

/** The cascade's fields, as they land on a page. Mirrors `PageContent` (lib/page-content.ts). */
export interface CascadeContent {
  title: string
  description: string
  /** Intro copy under the header (`page_content.body`, migration 20270345002700, ADR-1284). Plain
   *  text, paragraphs split on a blank line; `PageIntro` (components/templates) renders it. */
  body: string | null
  heroImage: string | null
  ctaLabel: string | null
  ctaHref: string | null
}

/** Where each resolved field came from. `'fallback'` = the page's coded default, which is a RESULT
 *  and not a failure: an empty table is the shipped state of most routes. */
export type CascadeOrigin = 'page' | 'section' | 'site' | 'fallback'

export interface CascadeResult extends CascadeContent {
  /** The scope each field resolved at. Exposed so an operator surface can say "inherited from
   *  /events" rather than showing an empty box over a filled-in page. */
  origin: {
    title: CascadeOrigin
    description: CascadeOrigin
    body: CascadeOrigin
    hero: CascadeOrigin
    cta: CascadeOrigin
  }
}

// ── THE PER-FIELD POLICY, AND WHY IT IS NOT UNIFORM ────────────────────────────────────────────
//
// `title` and `description` DO NOT INHERIT. They resolve at the page rung or fall through to the
// page's coded default, full stop. Two reasons, and both are consequences rather than taste:
//
//   · They are IDENTITY, not theme. A section titled "Events" inherited by `/events/calendar`
//     renames the calendar to "Events". The hero is a picture behind a page; the title is what the
//     page IS.
//   · They are SEO. `pageContentMetadata` (lib/page-content.ts) feeds both straight into the
//     route's `<title>`, meta description and og/twitter cards. Inheriting them would emit one
//     description across every page in a section — the duplicate-metadata pattern `check:seo`
//     exists to keep out of this tree, manufactured by the cascade itself.
//
// `heroImage` DOES inherit. It is the section's look, it is the only field production actually
// sets, and it is the reason this module exists.
//
// `body` DOES inherit (ADR-1284). It is the section's VOICE — the paragraph of intro under the
// header — and not the page's identity: a child of `/events` wearing the Events intro is the same
// child wearing the Events photo. It never feeds `<title>` or a meta description, so inheriting
// it manufactures none of the duplicate metadata that keeps `title` and `description` at the
// page rung. A page that sets its own `body` still wins, which is the per-field rule above.
//
// The CTA inherits AS A PAIR — see `pickCascade`.

/** A single scope's stored values. Blank strings and nulls both mean "this rung says nothing". */
export type CascadeRow = Partial<Record<keyof CascadeContent, string | null>>

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t ? t : null
}

/** PURE: fold a scope chain into one resolved bag. `rows` maps a scope key to that scope's stored
 *  values; a missing key is a scope with no row, which is the common case.
 *
 *  THE LADDER, top to bottom, per field:
 *
 *    1. the PAGE rung — the exact route's row
 *    2. the SECTION rungs — each ancestor route, nearest first (inherited fields only)
 *    3. the SITE rung — the reserved `'*'` row (inherited fields only)
 *    4. the page's coded fallback — a RESULT, not a failure
 *
 *  THE CTA IS ONE UNIT, NOT TWO FIELDS. `label` and `href` resolve together from the nearest scope
 *  that sets EITHER of them, and the pair is then kept only if both survive. Resolving them
 *  independently would splice a page's label onto a section's link — and that is not theoretical:
 *  production's `/circles` row carries `cta_label = "Start a Circle"` with an EMPTY `cta_href`, so
 *  independent inheritance would hand that label to the first page beneath `/circles` that set a
 *  link of its own, labelling someone else's button. Grouping keeps the existing "renders only
 *  when BOTH are set" rule true at every rung instead of only at the last one. */
export function pickCascade(
  chain: readonly string[],
  rows: Readonly<Record<string, CascadeRow | undefined>>,
  fallback: Partial<CascadeContent>,
): CascadeResult {
  // The page rung, unless the chain has none — `routeScopeChain` returns `['*']` alone for a key
  // that is not a route, and the site row must never be read as one page's identity.
  const page = (chain[0] === SITE_SCOPE ? undefined : rows[chain[0]]) ?? {}

  // Identity fields: page rung only.
  const title = clean(page.title)
  const description = clean(page.description)

  // Inherited: first non-blank down the chain.
  let body: string | null = null
  let bodyOrigin: CascadeOrigin = 'fallback'
  let heroImage: string | null = null
  let heroOrigin: CascadeOrigin = 'fallback'
  let ctaLabel: string | null = null
  let ctaHref: string | null = null
  let ctaOrigin: CascadeOrigin = 'fallback'

  for (let i = 0; i < chain.length; i++) {
    const row = rows[chain[i]]
    if (!row) continue
    const where: CascadeOrigin = chain[i] === SITE_SCOPE ? 'site' : i === 0 ? 'page' : 'section'
    if (!body) {
      const v = clean(row.body)
      if (v) { body = v; bodyOrigin = where }
    }
    if (!heroImage) {
      const v = clean(row.heroImage)
      if (v) { heroImage = v; heroOrigin = where }
    }
    if (ctaOrigin === 'fallback') {
      const l = clean(row.ctaLabel)
      const h = clean(row.ctaHref)
      // The nearest scope that speaks about the CTA at all OWNS it, even if what it says is
      // incomplete. A page that deliberately set a label and no link has not asked to borrow its
      // section's link.
      if (l || h) { ctaLabel = l; ctaHref = h; ctaOrigin = where }
    }
  }

  if (!body && clean(fallback.body)) {
    body = clean(fallback.body)
    bodyOrigin = 'fallback'
  }
  if (!heroImage && clean(fallback.heroImage)) {
    heroImage = clean(fallback.heroImage)
    heroOrigin = 'fallback'
  }
  if (ctaOrigin === 'fallback') {
    ctaLabel = clean(fallback.ctaLabel)
    ctaHref = clean(fallback.ctaHref)
  }
  // The CTA renders only when BOTH halves are present (migration 20260612050000). Enforced here so
  // every rung obeys it, not just the last one.
  if (!ctaLabel || !ctaHref) {
    ctaLabel = null
    ctaHref = null
    ctaOrigin = 'fallback'
  }

  return {
    title: title ?? fallback.title ?? '',
    description: description ?? fallback.description ?? '',
    body,
    heroImage,
    ctaLabel,
    ctaHref,
    origin: {
      title: title ? 'page' : 'fallback',
      description: description ? 'page' : 'fallback',
      body: body ? bodyOrigin : 'fallback',
      hero: heroImage ? heroOrigin : 'fallback',
      cta: ctaLabel && ctaHref ? ctaOrigin : 'fallback',
    },
  }
}

/** Read every scope in a route's chain in ONE query, keyed by scope. REQUEST-CACHED and FAIL-SAFE:
 *  any error resolves to an empty map, so a page falls back to its coded copy rather than to an
 *  error boundary. The chain is short (a 3-deep route is 4 keys: the route, its two ancestors, and `'*'` — `'/'` is never inserted as an ancestor, see the SITE_SCOPE note above), so this
 *  is the same single round trip the exact-route read was, with a wider `WHERE`. */
export const loadCascadeRows = cache(
  async (route: string): Promise<Record<string, CascadeRow>> => {
    const chain = routeScopeChain(route)
    try {
      const db = createAdminClient()
      const { data } = await db.from('page_content').select('*').in('route', chain)
      const out: Record<string, CascadeRow> = {}
      for (const row of data ?? []) {
        out[row.route] = {
          title: row.title,
          description: row.description,
          body: row.body,
          heroImage: row.hero_image,
          ctaLabel: row.cta_label,
          ctaHref: row.cta_href,
        }
      }
      return out
    } catch {
      return {}
    }
  },
)

/** Resolve a route's operator-editable copy through the site → section → page cascade, with the
 *  page's coded copy as the last rung. This is what `resolvePageContent` calls. */
export async function resolveContentCascade(
  route: string,
  fallback: Partial<CascadeContent>,
): Promise<CascadeResult> {
  const chain = routeScopeChain(route)
  const rows = await loadCascadeRows(route)
  return pickCascade(chain, rows, fallback)
}

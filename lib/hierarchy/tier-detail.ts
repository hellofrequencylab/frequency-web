import 'server-only'

import { resolveDetailHero, type DetailHeroProps } from '@/lib/layout/detail-hero'
import { surfaceAccess } from '@/lib/core/viewer-hats'
import { showsScopedInsight } from '@/lib/core/scoped-surface-ui'
import type { Capability } from '@/lib/core/capabilities'

// TIER DETAIL LOADING — the ONE round-trip behind a hierarchy tier's detail page (HYG-046).
//
// The rendering half is `components/hierarchy/tier-detail.tsx`; this is everything that touches
// the network. Two things live here precisely because they had already drifted between the Hub
// and Nexus pages (ADR-1197), and both are the kind of thing that only ever gets fixed on one
// twin:
//
//   1. CONCURRENCY. Caps, the scoped-Insight access check and the entity cover are all
//      independent given the tier's id, and so is its child list. They resolve in ONE round-trip
//      (site-audit PERF-6). The Hub page had this; the Nexus page ran three serial awaits, so it
//      paid three latencies for the same four reads. Keep the `Promise.all` — a `const x = await`
//      lifted above it is a silent regression, which is why the unit test asserts every read is in
//      flight before any of them resolves.
//
//   2. ARCHIVED CHILDREN. `archiveHub` / `archiveNexus` set `status = 'archived'` so the entity
//      "drops out of listings". The Hub page dropped archived Circles; the Nexus page did not drop
//      archived Hubs, so the one listing of Hubs the product has showed them and counted their
//      members. Exclusion now happens HERE, once, after the read — not in each page's query, where
//      it can be forgotten by exactly one of two callers.

/** The hierarchy tiers that have a detail page of this shape. */
export type TierKind = 'hub' | 'nexus'

export interface TierChrome<Child> {
  /** The viewer's caps for this scope. */
  caps: Set<Capability>
  /** `<tier>.manage` — the gate the header actions and every settings action share. */
  canManage: boolean
  /** Scoped Insight (ADR-225): true when this viewer leads THIS scope. */
  showsInsight: boolean
  /** Spread straight into `DetailTemplate` (PROG-P5, ADR-1136). */
  hero: DetailHeroProps
  /** The tier's live children, archived rows already dropped. */
  children: Child[]
}

/**
 * Resolve everything a tier detail page needs beyond its own entity row, in one round-trip.
 *
 * `children` takes the page's own child query (a Supabase builder is thenable, so pass it
 * unawaited) because the two tiers genuinely read different tables; everything the two tiers do
 * IDENTICALLY is decided here.
 */
export async function loadTierChrome<Child extends { status: string }>(opts: {
  kind: TierKind
  /** The tier entity's DB id. */
  id: string
  /** The tier's own route, for the entity cover ladder (`/hubs/<slug>`). */
  path: string
  loadCapabilities: (id: string) => Promise<Set<Capability>>
  /** The page's unawaited child query. Rows must carry `status`. */
  children: PromiseLike<{ data: unknown }>
}): Promise<TierChrome<Child>> {
  // Scoped Insight surface (P1.6 adoption, ADR-225): the IN-SCOPE matrix question, so a steward
  // who leads THIS tier by stewardship edge — even a global member — gets its Insight summary (a
  // Hub confers guide level, a Nexus mentor level ⇒ `full`). Additive: a non-leader resolves
  // `none` and the section stays hidden.
  const [caps, insightAccess, childRes, hero] = await Promise.all([
    opts.loadCapabilities(opts.id),
    surfaceAccess('insight', { type: opts.kind, id: opts.id }),
    opts.children,
    // The standard entity cover (PROG-P5, ADR-1136). Neither tier carries a cover column, so the
    // ladder is the operator's section Settings image or nothing — a visual no-op until an
    // operator uploads one, and then every page of that tier wears it.
    resolveDetailHero(opts.path),
  ])

  const rows = (childRes.data ?? []) as unknown as Child[]

  return {
    caps,
    canManage: caps.has(`${opts.kind}.manage` as Capability),
    showsInsight: showsScopedInsight(insightAccess),
    hero,
    children: rows.filter((row) => row.status !== 'archived'),
  }
}

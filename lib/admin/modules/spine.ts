// The 9-category spine, as browse metadata (docs/ADMIN-RAIL.md Phase 3; docs/EMBEDDED-ADMIN.md §2).
// PURE + client-safe — no React, no IO. The admin bar's drill-down (components/layout/admin-bar/
// admin-bar-body.tsx) reads this to render a browse-first, search-accelerated menu over the App
// catalog: HOME lists the populated categories in fixed spine order (drop-empty, P4/P5); a CATEGORY
// screen shows that slot's module cards; a single populated category collapses straight into its
// detail (today's flat panel = this case).
//
// Only the noun labels + icons and three tiny pure decisions live here (unit-tested in spine.test.ts);
// the module BODIES stay in settings-panel (they need React + the live registries).

import type { LucideIcon } from 'lucide-react'
import {
  CircleUser,
  Info,
  MapPin,
  Users,
  LayoutGrid,
  Target,
  Share2,
  Megaphone,
  Shield,
  BarChart3,
  CreditCard,
  AlertTriangle,
} from 'lucide-react'
import type { AdminSlot } from './registry'

/** The fixed spine order (P5 — fixed order = muscle memory). Mirrors the AdminSlot union; the browse
 *  list, grouping, and drop-empty all walk it, so a slot's rank is declared once, here. The personal
 *  'account' ("You") slot leads, so a signed-in member's own settings sit ABOVE the management spine
 *  (ADMIN-RAIL.md Phase 4) — it is NOT one of the 9 management categories, just first in the walk. */
export const SPINE_ORDER: readonly AdminSlot[] = [
  'account',
  'basics',
  'place',
  'people',
  'layout',
  'engage',
  'reach',
  'comms',
  'safety',
  'insights',
  'billing',
  'danger',
] as const

/** A spine category's browse chrome: its noun label (voice canon — no em dashes) + Lucide icon. */
export interface SpineMeta {
  label: string
  Icon: LucideIcon
}

/** Noun labels + icons for every spine slot (docs/EMBEDDED-ADMIN.md §2 — "settings as questions",
 *  named as short nouns). Labels pass NAMING.md + CONTENT-VOICE.md §10 (no em dashes). */
export const SPINE_META: Record<AdminSlot, SpineMeta> = {
  account: { label: 'You', Icon: CircleUser },
  basics: { label: 'Basics', Icon: Info },
  place: { label: 'Place & Time', Icon: MapPin },
  people: { label: 'People', Icon: Users },
  layout: { label: 'Layout', Icon: LayoutGrid },
  engage: { label: 'Engage', Icon: Target },
  reach: { label: 'Reach', Icon: Share2 },
  comms: { label: 'Comms', Icon: Megaphone },
  safety: { label: 'Safety', Icon: Shield },
  insights: { label: 'Insights', Icon: BarChart3 },
  billing: { label: 'Billing', Icon: CreditCard },
  danger: { label: 'Danger', Icon: AlertTriangle },
}

/** The personal "You" section chrome (ADMIN-RAIL.md Phase 4) — the header shown above the management
 *  spine. An alias of the 'account' slot meta, exported so the settings panel labels the section from
 *  one place. Voice canon: no em dashes. */
export const PERSONAL_META: SpineMeta = SPINE_META.account

/** The minimal App shape the spine helpers read — `id` + which spine `category` it sits in. */
interface SpineApp {
  id: string
  category: AdminSlot | 'element'
}

/** One populated spine category: its slot and the ordered ids of the apps that landed in it. */
export interface SpineGroup {
  slot: AdminSlot
  appIds: string[]
}

/**
 * Group scoped apps into the spine, in fixed SPINE_ORDER, DROPPING empty slots (P4/P5). Within a slot
 * the input order is preserved (the caller passes apps already ordered by their editor `order`), so the
 * flattened result equals today's SLOT_ORDER.flatMap(...) selection — behavior-preserving.
 */
export function groupIntoSpine(apps: readonly SpineApp[]): SpineGroup[] {
  return SPINE_ORDER.flatMap((slot) => {
    const appIds = apps.filter((a) => a.category === slot).map((a) => a.id)
    return appIds.length ? [{ slot, appIds }] : []
  })
}

/**
 * The personal "You" group (ADMIN-RAIL.md Phase 4): the ordered ids of the personal apps, kept
 * SEPARATE from the 9-category management spine. Filters to the 'account' slot so a caller can pass a
 * mixed list and get just the personal run, in input order (the caller orders personal apps by their
 * editor `order`). A tiny pure seam so the "You" section is built + tested like groupIntoSpine.
 */
export function groupPersonal(apps: readonly SpineApp[]): string[] {
  return apps.filter((a) => a.category === 'account').map((a) => a.id)
}

// ── The three-tier rail axis (ADR-514 three-tier reorg) ─────────────────────────────────────────────
// The owner directive: reorder the rail by importance into three bands — STANDARD content (identity /
// profile) inline at the very top, PRIMARY features next (ordered by importance), and EXTRA features
// obscured under a "More" disclosure. This is a SEPARATE axis from the spine `category` (which names the
// noun bucket) and from `render` (inline vs link-row): a band groups categories by frequency/importance.

/** The three rail bands, top to bottom. */
export type RailTier = 'standard' | 'primary' | 'extra'

/** The fixed render order of the bands: standard (inline, top) → primary → extra (under "More"). */
export const TIER_ORDER: readonly RailTier[] = ['standard', 'primary', 'extra'] as const

/** The minimal app shape the tier helpers read — the spine `category`, plus the optional band + within
 *  band `priority` and whether the app is a personal "You" app (so "You" leads its band). */
interface TierApp {
  id: string
  category: AdminSlot | 'element'
  tier?: RailTier
  priority?: number
  personal?: boolean
}

/**
 * The FAIL-SAFE band for an app (ADR-514 three-tier reorg): the explicit `tier` tag wins; an untagged
 * app defaults to `primary`, EXCEPT an untagged `danger` surface, which is forced to `extra` so a
 * destructive surface can never render expanded at the top. Pure + tested (spine.test.ts).
 */
export function tierForApp(a: { category: AdminSlot | 'element'; tier?: RailTier }): RailTier {
  if (a.tier) return a.tier
  return a.category === 'danger' ? 'extra' : 'primary'
}

/** One populated (tier, slot) section: its band, its spine slot, and the ordered ids of its apps. */
export interface TierSlotGroup {
  tier: RailTier
  slot: AdminSlot
  appIds: string[]
}

/**
 * Group scoped apps into the three-tier rail (ADR-514 three-tier reorg): partition by `tier` (fail-safe
 * defaults via `tierForApp`), then WITHIN each band sort by `priority` (personal-before-management, then
 * fixed spine order, then input order as tiebreaks) so "You" leads its band and importance orders the
 * rest; then group into per-slot sections in first-appearance order. Bands emit in TIER_ORDER, so the
 * result is standard sections, then primary, then extra. Non-spine ('element') apps are ignored. The
 * (tier, slot) pair keys each section — a slot may appear in more than one band (e.g. personal "You"
 * splits Profile→standard, Appearance→primary, Billing→extra), so the tier disambiguates.
 */
export function groupIntoTiers(apps: readonly TierApp[]): TierSlotGroup[] {
  const groups: TierSlotGroup[] = []
  for (const tier of TIER_ORDER) {
    const band = apps
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.category !== 'element' && tierForApp(a) === tier)
      .sort((x, y) => {
        const px = x.a.priority ?? 0
        const py = y.a.priority ?? 0
        if (px !== py) return px - py
        const persX = x.a.personal ? 0 : 1
        const persY = y.a.personal ? 0 : 1
        if (persX !== persY) return persX - persY
        const sx = SPINE_ORDER.indexOf(x.a.category as AdminSlot)
        const sy = SPINE_ORDER.indexOf(y.a.category as AdminSlot)
        if (sx !== sy) return sx - sy
        return x.i - y.i
      })
      .map(({ a }) => a)
    const bySlot = new Map<AdminSlot, string[]>()
    const order: AdminSlot[] = []
    for (const a of band) {
      const slot = a.category as AdminSlot
      if (!bySlot.has(slot)) {
        order.push(slot)
        bySlot.set(slot, [])
      }
      bySlot.get(slot)!.push(a.id)
    }
    for (const slot of order) groups.push({ tier, slot, appIds: bySlot.get(slot)! })
  }
  return groups
}

/** The App shape `summaryFor` reads — `label` + `category`. */
interface SummaryApp {
  label: string
  category: AdminSlot | 'element'
}

/**
 * A one-line summary for a category row (icon · label · SUMMARY · ›). Joins the slot's app labels
 * while short; falls back to an "N settings" count once there are more than three, so the row stays
 * glanceable (P5 — chunk to beat Hick's Law). Empty when the slot has no catalog apps (an extra-only
 * category supplies its own summary at the call site).
 */
export function summaryFor(slot: AdminSlot, apps: readonly SummaryApp[]): string {
  const labels = apps.filter((a) => a.category === slot).map((a) => a.label)
  if (labels.length === 0) return ''
  if (labels.length <= 3) return labels.join(', ')
  return `${labels.length} settings`
}

/**
 * Whether the bar should COLLAPSE the single populated category straight into its detail (P4) rather
 * than showing a home list — i.e. there is at most one drill target. A drill target is a populated
 * category OR the operator "Page" group (`hasExtras`), so a plain circle with only Basics stays flat
 * (pixel-identical to today), while Event/Circle (now multi-category) get the drill-down.
 */
export function shouldFlatten(
  categories: readonly { slot: AdminSlot }[],
  opts?: { hasExtras?: boolean },
): boolean {
  const drillTargets = categories.length + (opts?.hasExtras ? 1 : 0)
  return drillTargets <= 1
}

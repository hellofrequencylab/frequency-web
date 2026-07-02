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
 *  list, grouping, and drop-empty all walk it, so a slot's rank is declared once, here. */
export const SPINE_ORDER: readonly AdminSlot[] = [
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

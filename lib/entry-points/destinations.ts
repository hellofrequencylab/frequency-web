// Where an entry point can point (ADR-126). Broader than a bare marketing code
// (which is circle/event only): an entry point can point at a persona LEAD FLOW
// (/start/<flow>, ADR-125), a circle/event the member runs, or a curated public
// destination. Validation keeps it to a known, safe site-relative path (never an
// arbitrary external redirect). Client-safe: pure + no server imports.

import { listLeadFlows } from '@/lib/onboarding/lead-flows'
import { SITE_DESTINATIONS, isKnownDestination } from '@/lib/qr/destinations'
import type { MarketingTarget } from '@/lib/qr/marketing'

// Circle/event page paths (mirrors isValidMarketingPath, re-stated here so this stays
// client-safe — lib/qr/marketing.ts is server-only).
const CIRCLE_EVENT_RE = /^\/(?:circles|events)\/[\w-]+$/

const LEAD_FLOW_RE = /^\/start\/([\w-]+)$/

export function leadFlowPath(slug: string): string {
  return `/start/${slug}`
}

/** Is `path` a /start lead flow we actually have? */
export function isLeadFlowPath(path: string): boolean {
  const m = LEAD_FLOW_RE.exec(path)
  if (!m) return false
  return listLeadFlows().some((f) => f.slug === m[1])
}

/** A destination is valid only if it's a known, safe site-relative path. */
export function isValidEntryDestination(path: string): boolean {
  if (typeof path !== 'string' || !path.startsWith('/')) return false
  return isLeadFlowPath(path) || CIRCLE_EVENT_RE.test(path) || isKnownDestination(path)
}

export interface DestinationOption {
  value: string
  label: string
}

export interface DestinationGroup {
  group: string
  items: DestinationOption[]
}

// A handful of curated public landings worth pointing a flyer at, beyond the lead
// flows + the member's own circles/events.
const CURATED_PATHS = ['/discover', '/discover/events', '/discover/circles']

/** Grouped destination options for the builder's picker. `targets` are the member's
 *  own circles + hosted events (server-fetched via listMarketingTargets). */
export function entryDestinationGroups(targets: MarketingTarget[]): DestinationGroup[] {
  const groups: DestinationGroup[] = [
    {
      group: 'Lead flows (capture + route)',
      items: listLeadFlows().map((f) => ({ value: leadFlowPath(f.slug), label: f.label })),
    },
  ]

  if (targets.length) {
    groups.push({
      group: 'Your circles & events',
      items: targets.map((t) => ({ value: t.path, label: `${t.type === 'circle' ? '○' : '◆'} ${t.label}` })),
    })
  }

  const curated = SITE_DESTINATIONS.filter((d) => CURATED_PATHS.includes(d.path))
  if (curated.length) {
    groups.push({ group: 'Public pages', items: curated.map((d) => ({ value: d.path, label: d.label })) })
  }

  return groups
}

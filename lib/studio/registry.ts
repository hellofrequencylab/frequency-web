import type { LucideIcon } from 'lucide-react'
import { Route, Sparkles, Users, CalendarDays } from 'lucide-react'

// The Studio registry (docs/STUDIO.md §3): one entry per buildable entity — its
// label, icon, how it launches, and the human rule for who can create one. This is
// the single place the "what can I create here, and may I" question is answered;
// the eventual universal "Create +" reads from it, and each builder's gating uses
// the same capability resolver (lib/core/capabilities.ts) named here.
//
// Journey is live (ADR-142). Circle/practice/event entries are declared so the
// registry is the contract from day one; their builders land per ADR-143's order.

export type StudioEntity = 'journey' | 'practice' | 'circle' | 'event'

export interface StudioEntityEntry {
  entity: StudioEntity
  label: string
  icon: LucideIcon
  /** One-line description for a create menu. */
  blurb: string
  /** How the builder opens. */
  launch: 'modal' | 'route'
  /** Human-readable create rule (the capability is enforced server-side). */
  createRule: string
  /** Whether the builder is wired up yet. */
  ready: boolean
}

export const STUDIO_REGISTRY: Record<StudioEntity, StudioEntityEntry> = {
  journey: {
    entity: 'journey',
    label: 'Journey',
    icon: Route,
    blurb: 'A life-development track of practices to share',
    launch: 'modal',
    createRule: 'any member',
    ready: true,
  },
  practice: {
    entity: 'practice',
    label: 'Practice',
    icon: Sparkles,
    blurb: 'A single thing you do: meditate, move, journal',
    launch: 'modal',
    createRule: 'any member',
    ready: true,
  },
  circle: {
    entity: 'circle',
    label: 'Circle',
    icon: Users,
    blurb: 'A local group around a shared interest',
    launch: 'modal',
    createRule: 'member (with a topic) · host+ for managed',
    ready: false,
  },
  event: {
    entity: 'event',
    label: 'Event',
    icon: CalendarDays,
    blurb: 'A gathering your circle shows up to',
    launch: 'route',
    createRule: 'crew+ (member of the circle)',
    ready: false,
  },
}

/** Entities currently buildable, in menu order. */
export function readyEntities(): StudioEntityEntry[] {
  return Object.values(STUDIO_REGISTRY).filter((e) => e.ready)
}

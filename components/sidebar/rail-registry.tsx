import type { ReactNode } from 'react'
import {
  DispatchesPanel, EventsPanel, MembersPanel, LeaderboardPanel, WhoOnlinePanel,
  CirclesPanel, NewCirclesPanel, ActiveNowPanel, PulsePanel,
} from '@/components/sidebar/rail-panels'
import type { PanelKey } from '@/lib/layout/rail-panels'

// The right rail's WIDGET SLOT registry (PAGE-FRAMEWORK §4.4, ADR-250 step 2). The route
// map (lib/layout/rail-panels.ts) decides WHICH panel keys a page shows; this registry
// decides what each key RENDERS. The rail (right-sidebar.tsx) maps the keys through this
// table instead of a hardcoded `key === …` switch, so a new vertical contributes a rail
// panel by registering one entry — no edit to the rail's render loop.
//
// Panels take heterogeneous data, so each declares what it needs from one shared context
// (the viewer + their prefetched active-circle ids) plus an optional visibility gate. The
// rail prefetches circle ids once iff any selected panel needs them.

export interface RailPanelContext {
  profileId: string
  /** The viewer's active circle ids (prefetched once when any panel needs them). */
  circleIds: string[]
  /** crew+ (the gate for the leaderboard panel). */
  isCrew: boolean
}

export interface RailPanelDef {
  /** True if this panel reads `ctx.circleIds` — drives the single prefetch. */
  needsCircles?: boolean
  /** Optional visibility gate; omitted ⇒ always shown. */
  gate?: (ctx: RailPanelContext) => boolean
  /** Render the panel for the given context. */
  render: (ctx: RailPanelContext) => ReactNode
}

export const RAIL_PANELS: Record<PanelKey, RailPanelDef> = {
  pulse: {
    render: () => <PulsePanel />,
  },
  dispatches: {
    needsCircles: true,
    render: ({ profileId, circleIds }) => <DispatchesPanel profileId={profileId} circleIds={circleIds} />,
  },
  events: {
    needsCircles: true,
    render: ({ circleIds }) => <EventsPanel circleIds={circleIds} />,
  },
  members: {
    needsCircles: true,
    render: ({ profileId, circleIds }) => <MembersPanel profileId={profileId} circleIds={circleIds} />,
  },
  online: {
    render: ({ profileId }) => <WhoOnlinePanel profileId={profileId} />,
  },
  circles: {
    needsCircles: true,
    render: ({ circleIds }) => <CirclesPanel circleIds={circleIds} />,
  },
  newcircles: {
    needsCircles: true,
    render: ({ circleIds }) => <NewCirclesPanel circleIds={circleIds} />,
  },
  activenow: {
    render: ({ profileId }) => <ActiveNowPanel profileId={profileId} />,
  },
  leaderboard: {
    gate: ({ isCrew }) => isCrew,
    render: () => <LeaderboardPanel />,
  },
}

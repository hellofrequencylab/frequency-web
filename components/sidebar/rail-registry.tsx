import type { ReactNode } from 'react'
import {
  DispatchesPanel, EventsPanel, MembersPanel, LeaderboardPanel, WhoOnlinePanel,
  CirclesPanel, NewCirclesPanel, ActiveNowPanel, PulsePanel,
} from '@/components/sidebar/rail-panels'
import { CommunityBoardPanel } from '@/components/sidebar/community-panel'
import { SpaceEventsPanel, SpaceCirclesPanel, SpaceTeamPanel } from '@/components/sidebar/space-rail-panels'
import type { PanelKey } from '@/lib/layout/rail-panels'
import type { Space } from '@/lib/spaces/types'

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
  /** The Space this route is INSIDE, resolved once for the viewer when any panel needs it, or null
   *  off a Space route (and for a Space this viewer may not see). Same one-prefetch shape as
   *  `circleIds` above: the rail resolves it, never a panel. */
  space: Space | null
}

export interface RailPanelDef {
  /** True if this panel reads `ctx.circleIds` — drives the single prefetch. */
  needsCircles?: boolean
  /** True if this panel reads `ctx.space` — drives the single viewer-gated Space resolve. */
  needsSpace?: boolean
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
  // The community board — your Circles' next gathering and what your Spaces have been saying
  // (ADR-1362). It led /feed for a day under LIVE-248; the practice board took that slot back,
  // because this column is `hidden lg:flex` and the practice board is the one a phone needs.
  community: {
    render: ({ profileId }) => <CommunityBoardPanel profileId={profileId} />,
  },
  // The SPACE-SCOPED panels (LIVE-518) — the Space the member is standing in, not the platform.
  // All three gate on `ctx.space`: off a Space route, or on a Space this viewer may not see, the
  // resolve returns null and the key renders nothing rather than falling back to something global.
  spaceevents: {
    needsSpace: true,
    gate: ({ space }) => space !== null,
    render: ({ space }) => (space ? <SpaceEventsPanel space={space} /> : null),
  },
  spacecircles: {
    needsSpace: true,
    gate: ({ space }) => space !== null,
    render: ({ space }) => (space ? <SpaceCirclesPanel space={space} /> : null),
  },
  spaceteam: {
    needsSpace: true,
    gate: ({ space }) => space !== null,
    render: ({ space }) => (space ? <SpaceTeamPanel space={space} /> : null),
  },
}

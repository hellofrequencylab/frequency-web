'use server'

// THE ONE-REQUEST ENTITY RAIL (ADR-1685, LIVE-655) — the Space rail's one-bundle pattern (ADR-550)
// for circle, event, hub, nexus and practice rails.
//
// Each rail module on those pages used to call its own 'use server' getter on mount. Next.js
// dispatches Server Actions ONE AT A TIME per client (node_modules/next/dist/docs, "Server Actions and
// Mutations": "do not rely on Promise.all to parallelize Server Actions from the client"), so a circle
// rail's ten reads ran as ten sequential POSTs, each paying the proxy's own auth.getUser() and each
// re-resolving the viewer from scratch. Three of the ten were the same read (getCircleAdminData, for
// Settings, Guided and the Circle Quest block).
//
// This action runs the reads the mounted modules need, each ONCE, in parallel, inside ONE request, and
// hands back each result. It calls the SAME getters the modules call, with the same argument, so every
// slice carries the same data and the same gate (each getter re-checks its capability and returns null
// for a viewer who lacks it). It adds no read and no authority of its own.
//
// FAIL-SAFE ISOLATION. A read that throws comes back as `{ ok: false }`, is logged here so the fallback
// is visible, and the module that wanted it calls its own getter exactly as it did before this file.
//
// ONE VIEWER PER BUNDLE (LIVE-734). React `cache()` does not dedupe inside a Server Action, so each
// getter used to resolve the viewer for itself: one `auth.getUser()`, the profiles row, the
// stewardship edges and the crew grant per read, plus the same entity's capability rows per read.
// The reads now run inside one action scope (lib/core/action-scope.ts). The viewer is resolved once
// at the top of the scope, and every getter's gate reads that same viewer and that entity's
// capability set from the scope's memo instead of fetching its own. The getters' signatures are
// unchanged on purpose: they are Server Actions too, so a viewer passed as an argument would be a
// value the client could forge.

import {
  getCircleAdminData,
  getCirclePlaceTimeData,
  getCirclePeopleData,
  getCircleEngageData,
  getCirclePracticeAssignData,
  getCircleInsightsData,
} from '@/app/(main)/circles/admin-actions'
import { getCircleMoveData } from '@/app/(main)/circles/[slug]/transfer-actions'
import { getCircleJourneyRunData } from './circle-journey-run-actions'
import { getEventAdminData, getEventCoreStats, getEventPeopleData } from '@/app/(main)/events/admin-actions'
import { getHubAdminData, getHubPeopleData, getHubInsightsData } from '@/lib/hierarchy/hub-admin'
import { getNexusAdminData, getNexusPeopleData, getNexusInsightsData } from '@/lib/hierarchy/nexus-admin'
import { getPracticeAdminData, getPracticeInsightsData } from '@/app/(main)/practices/admin-actions'
import type { EntityRailKind, EntityRailReadKey } from '@/lib/admin/entity-rail-reads'
import { runInActionScope } from '@/lib/core/action-scope'
import { resolveViewerOnce } from '@/lib/core/load-capabilities'

type Getter = (key: string) => Promise<unknown>

/** One getter per read, per kind. Typed against ENTITY_RAIL_READ_KEYS, so a read the client can ask
 *  for with no getter here (or a getter for a read it cannot ask for) is a type error. Each entry is
 *  the exact function the module passes to useEntityRailRead (entity-rail-data.test.ts holds them
 *  equal). */
const GETTERS: { [K in EntityRailKind]: Record<EntityRailReadKey<K>, Getter> } = {
  circle: {
    admin: getCircleAdminData,
    placeTime: getCirclePlaceTimeData,
    people: getCirclePeopleData,
    engage: getCircleEngageData,
    practice: getCirclePracticeAssignData,
    journeyRun: getCircleJourneyRunData,
    insights: getCircleInsightsData,
    move: getCircleMoveData,
  },
  event: {
    admin: getEventAdminData,
    coreStats: getEventCoreStats,
    people: getEventPeopleData,
  },
  hub: {
    admin: getHubAdminData,
    people: getHubPeopleData,
    insights: getHubInsightsData,
  },
  nexus: {
    admin: getNexusAdminData,
    people: getNexusPeopleData,
    insights: getNexusInsightsData,
  },
  practice: {
    admin: getPracticeAdminData,
    insights: getPracticeInsightsData,
  },
}

/** One read's outcome. `ok: false` means the getter threw; the module then self-fetches. */
export type EntityRailSlice = { ok: true; data: unknown } | { ok: false }

/** Run the named reads for one entity in ONE request, each once and in parallel. Unknown kinds and
 *  reads are ignored (the client is not trusted to name a getter), so the result holds only reads
 *  this table knows. Every getter self-gates; nothing here widens what a viewer can read. */
export async function getEntityRailBundle(
  kind: string,
  key: string,
  reads: string[],
): Promise<Record<string, EntityRailSlice>> {
  const table = Object.hasOwn(GETTERS, kind) ? (GETTERS[kind as EntityRailKind] as Record<string, Getter>) : null
  if (!table || typeof key !== 'string' || !key || !Array.isArray(reads)) return {}

  const wanted = [...new Set(reads)].filter((r): r is string => typeof r === 'string' && Object.hasOwn(table, r))
  if (wanted.length === 0) return {}

  const settled = await runInActionScope(async () => {
    // Resolve the viewer ONCE, before the getters start. A failure is not swallowed: the scope keeps
    // the rejected read, each getter's gate meets the same rejection, and every slice comes back
    // `{ ok: false }` and is logged below, so each module self-fetches exactly as before.
    await resolveViewerOnce().catch(() => undefined)
    return Promise.allSettled(wanted.map((r) => table[r](key)))
  })

  const out: Record<string, EntityRailSlice> = {}
  wanted.forEach((read, i) => {
    const s = settled[i]
    if (s.status === 'fulfilled') {
      out[read] = { ok: true, data: s.value }
    } else {
      console.error('[entity-rail] a bundled read failed; its module will self-fetch', {
        kind,
        read,
        message: s.reason instanceof Error ? s.reason.message : String(s.reason),
      })
      out[read] = { ok: false }
    }
  })
  return out
}

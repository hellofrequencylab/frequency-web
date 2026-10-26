'use client'

// The Journey's Guided section (ADR-450 §2 · ADR-996). The surface is the shared GuidedModule;
// this file supplies only what is a Journey's own.
//
// Guided questions remain separate from manually authored Journey fields.

import { JOURNEY_MANIFEST } from '@/lib/studio/entities/journey'
import { getJourneyRailData } from '@/app/(main)/journeys/admin-actions'
import { redrawJourneyAction, restoreJourneyAction, type JourneyRedrawState } from '@/app/(main)/journeys/actions'
import { GuidedModule } from './guided-module'

const routeKey = (pathname: string) => pathname.match(/^\/journeys\/([^/]+)/)?.[1] ?? null

/** getJourneyRailData returns null unless the viewer holds journey.editSettings, so a non-author
 *  resolves to no entity and the section renders nothing. */
const resolve = async (slug: string) => (await getJourneyRailData(slug))?.planId ?? null

const restore = (id: string, before: JourneyRedrawState) => restoreJourneyAction(id, before)

export function JourneyGuidedModule() {
  return (
    <GuidedModule
      coachingOnly
      redrawLabel="Get coaching questions"
      moduleId="journey.guided"
      manifest={JOURNEY_MANIFEST}
      blurb="Get questions about your Journey while keeping every field in your own words."
      routeKey={routeKey}
      resolve={resolve}
      redraw={redrawJourneyAction}
      restore={restore}
    />
  )
}

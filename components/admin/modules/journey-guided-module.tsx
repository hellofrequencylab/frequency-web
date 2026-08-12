'use client'

// The Journey's Guided section (ADR-450 §2 · ADR-996). The surface is the shared GuidedModule;
// this file supplies only what is a Journey's own.
//
// The Journey's redraw re-words the name, the promise, the overview, and each week's focus. It
// deliberately does NOT touch the practices inside the weeks: "draft it again" is a rewrite, not
// a restructure, and the editor's own Vera box is where an author asks for that. Pinning
// `Identity` or `The weekly arc` holds either half through a redraw.

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
      moduleId="journey.guided"
      manifest={JOURNEY_MANIFEST}
      blurb="Draft this Journey again with Vera: the name, the promise, the overview, and each week's focus. Pin what you want kept."
      routeKey={routeKey}
      resolve={resolve}
      redraw={redrawJourneyAction}
      restore={restore}
    />
  )
}

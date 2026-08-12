'use client'

// The Event's Guided section (ADR-450 §2 · ADR-996). The surface is the shared GuidedModule; this
// file supplies only what is an Event's own.
//
// NO PINS RENDER HERE, and that is correct rather than missing: the Event manifest declares
// `steer: { mood, directions }` and no `lock`, so SparkSteer draws no "keep as is" row. The
// redraw is bounded server-side to the title and the description, so the date, the place, the
// price, and the tiers are outside its reach entirely. Declaring `lock` on the manifest is what
// would turn pins on, and nothing here would have to change.

import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import { getEventAdminData } from '@/app/(main)/events/admin-actions'
import { redrawEventAction, restoreEventAction, type EventRedrawResult } from '@/app/(main)/events/actions'
import { GuidedModule } from './guided-module'

const routeKey = (pathname: string) => pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

/** getEventAdminData returns null unless the viewer holds event.editSettings, so a non-host
 *  resolves to no entity and the section renders nothing. */
const resolve = async (slug: string) => (await getEventAdminData(slug))?.id ?? null

const restore = (id: string, before: EventRedrawResult['before']) => restoreEventAction(id, before)

export function EventGuidedModule() {
  return (
    <GuidedModule
      moduleId="event.guided"
      manifest={EVENT_MANIFEST}
      blurb="Draft this event's name and description again with Vera. The date, the place, and the price are never touched."
      routeKey={routeKey}
      resolve={resolve}
      redraw={redrawEventAction}
      restore={restore}
      redrawLabel="Write it again"
    />
  )
}

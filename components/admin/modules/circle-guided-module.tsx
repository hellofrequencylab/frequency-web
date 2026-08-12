'use client'

// The Circle's Guided section (ADR-450 §2 · ADR-996). The surface is the shared GuidedModule;
// this file supplies only what is a Circle's own: its manifest, its read-gated getter, and its
// two actions.
//
// The Circle is the entity that proved the LOCK had a hole in it: it pins `agreements`, which is
// a REPEATED collection, and the kernel used to resolve a repeat's section to zero paths. The pin
// rendered and protected nothing. Fixed in lib/studio/kernel/redraw.ts (ADR-996), so pinning the
// group's own norms now holds through a redraw.

import { CIRCLE_MANIFEST } from '@/lib/studio/entities/circle'
import { getCircleAdminData } from '@/app/(main)/circles/admin-actions'
import { redrawCircleAction, restoreCircleAction, type CircleRedrawResult } from '@/app/(main)/circles/actions'
import { GuidedModule } from './guided-module'

const routeKey = (pathname: string) => pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

/** getCircleAdminData returns null unless the viewer holds circle.editSettings, so a non-host
 *  resolves to no entity and the section renders nothing. */
const resolve = async (slug: string) => (await getCircleAdminData(slug))?.id ?? null

const restore = (id: string, before: CircleRedrawResult['before']) => restoreCircleAction(id, before)

export function CircleGuidedModule() {
  return (
    <GuidedModule
      moduleId="circle.guided"
      manifest={CIRCLE_MANIFEST}
      blurb="Draft this Circle again with Vera. Pin the name or the agreements and they survive untouched."
      routeKey={routeKey}
      resolve={resolve}
      redraw={redrawCircleAction}
      restore={restore}
    />
  )
}

'use client'

// The Practice's Guided section (ADR-450 §2 · ADR-994 · ADR-996). The whole surface is the shared
// GuidedModule; this file supplies only what is genuinely a Practice's own: its manifest, its
// read-gated getter, and its two actions.
//
// It used to be the whole surface, hand-written, because it was the FIRST one (ADR-994 shipped
// edit re-entry for the Practice alone so the shape could be proven before it was copied). Three
// entities later the shape held, so the surface moved to guided-module.tsx and this became the
// declaration it should always have been.

import { PRACTICE_MANIFEST } from '@/lib/studio/entities/practice'
import { getPracticeAdminData } from '@/app/(main)/practices/admin-actions'
import {
  redrawPracticeAction,
  updatePracticeAction,
  type PracticeRedrawResult,
} from '@/app/(main)/practices/actions'
import { GuidedModule } from './guided-module'

const routeKey = (pathname: string) => pathname.match(/^\/practices\/([^/]+)/)?.[1] ?? null

/** getPracticeAdminData returns null unless the viewer holds practice.editSettings, so a
 *  non-owner resolves to no entity and the section renders nothing. */
const resolve = async (id: string) => ((await getPracticeAdminData(id)) ? id : null)

/** The Practice's put-it-back is its ordinary edit action: a Practice redraw's `before` IS a
 *  PracticeEdit, because its manifest paths are its column names. */
const restore = (id: string, before: PracticeRedrawResult['before']) =>
  updatePracticeAction(id, before)

export function PracticeGuidedModule() {
  return (
    <GuidedModule
      moduleId="practice.guided"
      manifest={PRACTICE_MANIFEST}
      blurb="Draft this practice again with Vera. Pin anything you want kept and it survives untouched."
      routeKey={routeKey}
      resolve={resolve}
      redraw={redrawPracticeAction}
      restore={restore}
    />
  )
}

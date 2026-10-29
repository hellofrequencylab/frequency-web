// THE PUBLISHED SCREEN (VLS-09), the pure half. After a step makes its thing, the person lands on a screen that says
// so, links to the real page they made, and offers the next step. This file works out those three facts from the
// launch row; the screen is components/launch/published-screen.tsx. PURE, so a probe can run it under node.
//
// Each step's public page is added here as the step arrives, in `publicPageOf`. Until then a step has no page to link
// to and the screen simply offers the next step.

import { resumeStep, type LaunchSnapshot } from './state.ts'
import { isLaunchStepId, launchStep, launchStepHref, type LaunchStepId } from './steps.ts'

/** The step a URL segment names (`get-paid` is the Get paid step), or null. */
export function stepFromSlug(slug: string): LaunchStepId | null {
  if (slug === 'get-paid') return 'paid'
  return isLaunchStepId(slug) && slug !== 'paid' ? slug : null
}

/** Where a step's published screen lives. */
export function launchStepPublishedHref(id: LaunchStepId): string {
  return `${launchStepHref(id)}/published`
}

/** The real public page of what a step made, from the reference the step recorded when it published. Null when
 *  the step has no page of its own yet or recorded none. */
function publicPageOf(id: LaunchStepId, ref: string | undefined): string | null {
  if (id === 'spotlight' && ref) return `/spaces/${encodeURIComponent(ref)}/spotlight`
  return null
}

export type PublishedView =
  | { kind: 'not_yet' }
  | { kind: 'done'; label: string; liveHref: string | null; next: { label: string; href: string } | null }

/** What the published screen shows for one step of one launch. `not_yet` when the step is not published (a skipped or
 *  untouched step has nothing to celebrate, so the page sends the person back to the step). */
export function publishedView(l: LaunchSnapshot, id: LaunchStepId): PublishedView {
  const entry = l.steps[id]
  if (entry?.status !== 'published') return { kind: 'not_yet' }
  const next = resumeStep(l.niche, l.intents, l.steps)
  return {
    kind: 'done',
    label: launchStep(id).label,
    liveHref: publicPageOf(id, entry.ref),
    next: next ? { label: launchStep(next).label, href: launchStepHref(next) } : null,
  }
}

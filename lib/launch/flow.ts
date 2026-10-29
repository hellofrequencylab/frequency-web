// THE LAUNCH PAGE, the pure half. One page carries the whole launch: the Spotlight form, then the live preview of
// what was made, then the stages still to come. This works out which stage each part is in from the launch row.
// PURE (no app imports beyond the launch's own readers), so a probe can run it under node.

import type { LaunchSnapshot } from './state.ts'

type FlowStageState = 'live' | 'next' | 'later'

export interface FlowStage {
  id: 'spotlight' | 'space' | 'website' | 'email'
  label: string
  state: FlowStageState
}

export interface FlowView {
  stages: FlowStage[]
  /** The Space's handle once the Spotlight is published, else null. */
  slug: string | null
  /** The public Spotlight page, once there is one. */
  spotlightHref: string | null
}

const STAGES: readonly { id: FlowStage['id']; label: string }[] = [
  { id: 'spotlight', label: 'Spotlight' },
  { id: 'space', label: 'Your Space' },
  { id: 'website', label: 'Website' },
  { id: 'email', label: 'Email' },
]

/** The page's state. Before the Spotlight is published it is the one stage in front of the person; after, it is
 *  live and Your Space is next. Website and Email wait behind the Space. A visitor with no launch is at the start. */
export function flowView(launch: LaunchSnapshot | null): FlowView {
  const entry = launch?.steps.spotlight
  const published = entry?.status === 'published' && !!entry.ref
  const slug = published ? (entry.ref as string) : null
  const spaceKept = published && launch?.steps.space?.status === 'published'
  const stages: FlowStage[] = STAGES.map((s) => {
    if (s.id === 'spotlight') return { ...s, state: published ? 'live' : 'next' }
    if (s.id === 'space') return { ...s, state: spaceKept ? 'live' : published ? 'next' : 'later' }
    if (s.id === 'website') return { ...s, state: spaceKept ? 'next' : 'later' }
    return { ...s, state: 'later' }
  })
  return { stages, slug, spotlightHref: slug ? `/spaces/${encodeURIComponent(slug)}/spotlight` : null }
}

/** The page heading: what the person is looking at before and after the Spotlight is live. */
export function flowHeading(view: FlowView): { eyebrow: string; title: string; description: string } {
  return view.slug
    ? { eyebrow: 'Your launch', title: 'Your Spotlight is live', description: 'Look it over. Change anything and save, or keep going.' }
    : { eyebrow: 'Your launch', title: 'Start with your Spotlight', description: 'One page that is all yours, in your own words. Say who you are and where to find you.' }
}

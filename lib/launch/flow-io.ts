// THE LAUNCH PAGE, the read half. What the Spotlight form opens with when the person comes back to change it: the
// answers their saved Spotlight was written from. Read through lib/spaces/store.ts. Server-only. Never throws: a
// failed read just opens the form empty.

import { readSpaceSpotlight } from '@/lib/spaces/spotlight'
import { getSpaceById } from '@/lib/spaces/store'
import type { LaunchSnapshot } from './state'
import { answersFromLayout, type SpotlightAnswers } from './spotlight-step'

export async function loadSpotlightAnswers(launch: LaunchSnapshot | null): Promise<SpotlightAnswers | null> {
  if (!launch?.spaceId) return null
  try {
    const space = await getSpaceById(launch.spaceId)
    if (!space) return null
    const saved = answersFromLayout(readSpaceSpotlight(space.preferences).layout)
    // What the Space already says fills what the Spotlight does not: its tagline, then the start of its about text.
    const line = saved.line || space.tagline || (space.about ?? '').split('\n')[0].slice(0, 300)
    return { ...saved, name: saved.name || space.name, line }
  } catch {
    return null
  }
}

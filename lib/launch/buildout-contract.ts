// TEMPORARY (lane F, Review + Publish). Lane E (branch lane/buildout) owns this type in lib/launch/buildout.ts.
// DELETE THIS FILE on rebase onto lane E and point the imports at './buildout'. The shape below is the agreed
// contract, copied exactly. PURE.

import type { SpotlightAnswers } from './spotlight-step.ts'

type BuildoutSlot = 'spotlight' | 'space' | 'website' | 'email'

export interface BuildoutDraft {
  spotlight: SpotlightAnswers
  space: { tagline: string; about: string }
  website: { headline: string; intro: string }
  email: { subject: string; body: string }
  /** The person's own words behind a drafted field, with where they came from. */
  cites: { slot: BuildoutSlot; field: string; snippet: string; origin: string }[]
}

// Where a merged public page's links land now (owner rulings 2026-10-14). One table, so every link
// that used to name a retired route reads its survivor from here instead of retyping it.
//
// The survivors of two merges are FREQUENCY-ONLY routes (/features and /vision answer 404 under DAWN,
// ADR-1737), so a DAWN build sends the same links to the nearest page it does serve. next.config.ts
// makes the same split for the redirects: permanent to the ruled target under Frequency, temporary to
// the DAWN fallback otherwise, so a later switch to Frequency is never blocked by a cached 308.
import { SITE_DESIGN } from '@/lib/theme/design'

const FREQUENCY = SITE_DESIGN === 'frequency'

/** /the-quest merged into the Features page's Zaps card. DAWN: the Quest help category. */
export const QUEST_HREF = FREQUENCY ? '/features#f-zaps' : '/help/the-quest'

/** /the-lab merged into /vision (its plan and FAQ moved there). DAWN: the mission page. */
export const LAB_HREF = FREQUENCY ? '/vision' : '/about'

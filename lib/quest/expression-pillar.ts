// Expression — the 4th Pillar's display identity (one source of truth).
//
// The Quest's Pillars are Mind / Body / Spirit / Expression (docs/NAMING.md). Three
// Pillars carry Journeys (Mind, Body, Spirit); Expression is woven into EVERY Journey
// as its Expression Challenge capstone, not a fourth Journey. So Expression needs a
// consistent visual identity wherever a Journey's structure is shown, so it reads as a
// peer of the other three rather than an afterthought.
//
// Mind/Body/Spirit borrow the climb-ladder rank tokens on the Season Map (jade/teal/
// gold via the arc index). Expression takes a DISTINCT accent so it never collides with
// the climb read: `plum` from the same DAWN rank spectrum (--rank-plum / -deep /
// -bright), driven through the same rankBadgeStyle CSS-var contract. Its face is the
// Sparkles icon already used for Expression across the app (the next-step nudge, the
// capstone card, the ExpressionAction control). Pure constants — client + server safe,
// no hooks, no DB, semantic tokens only.

import { Sparkles, type LucideIcon } from 'lucide-react'
import { rankBadgeStyle, type RankKey } from '@/lib/season-ranks'

/** Expression's accent token on the DAWN rank spectrum (distinct from the climb ladder). */
export const EXPRESSION_RANK_KEY: RankKey = 'plum'

/** The Expression face — the same Sparkles icon used for the capstone everywhere. */
export const ExpressionIcon: LucideIcon = Sparkles

/** The --rank / --rank-deep / --rank-bright CSS vars for Expression's accent. */
export function expressionPillarStyle(): React.CSSProperties {
  return rankBadgeStyle(EXPRESSION_RANK_KEY)
}

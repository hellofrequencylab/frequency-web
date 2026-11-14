import type { BuilderDraft } from './builder'
import type { DoorArrival } from './door'
import { intentsFromOffer } from './intents-from-offer'
import { mergeNicheGoals, nicheModeChoice, resolveNicheSeed, type NicheChoice } from './niche-choices'

/** Resolve the public niche alias at the boundary without changing the existing door parser's contract. */
export function nicheArrival(arrival: DoorArrival, choices: readonly NicheChoice[], rawNiche: unknown, rawMode?: unknown): DoorArrival & { modeHint?: string } {
  const seed = resolveNicheSeed(choices, rawNiche, rawMode)
  const mode = nicheModeChoice(rawMode)?.id ?? seed?.mode
  return {
    ...arrival,
    ...(seed ? { niche: seed.niche, goals: mergeNicheGoals(seed.goals, arrival.goals) } : {}),
    ...(mode ? { modeHint: mode } : {}),
  }
}

/** Selecting a chip replaces only the previous niche's seeded goals; the person's other goals remain. */
export function chooseDraftNiche(draft: BuilderDraft, choices: readonly NicheChoice[], rawNiche: unknown): BuilderDraft {
  const seed = resolveNicheSeed(choices, rawNiche)
  if (!seed) return draft
  const previous = resolveNicheSeed(choices, draft.niche, draft.modeHint)
  const extra = draft.goals.filter((goal) => !previous?.goals.includes(goal))
  return {
    ...draft, niche: seed.niche, modeHint: seed.mode,
    goals: mergeNicheGoals(seed.goals, [...extra, ...(draft.offer.trim() ? intentsFromOffer(draft.offer) : [])]),
  }
}

/** A sentence adds goals without replacing the independently selected niche or Mode/Focus. */
export function goalsFromNicheOffer(draft: BuilderDraft, offer: string) {
  return mergeNicheGoals(draft.goals, intentsFromOffer(offer))
}

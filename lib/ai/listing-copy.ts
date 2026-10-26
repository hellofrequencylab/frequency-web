import type { ProductKind, ServicePriceModel } from '@/lib/commerce/types'
import { writingCoach, parseWritingQuestions } from './writing-coach'
interface ListingCopyInput {
  /** The commerce kind, so the copy frames a product vs a bookable service vs a ticket. */
  kind: ProductKind
  /** The working name / a few keywords the author typed (the richest grounding). */
  seed?: string | null
  /** How the listing is priced (fixed / from / free / contact) — services only; shapes the framing. */
  priceModel?: ServicePriceModel | null
  /** The Space/maker brand or name, if the author wants the copy to name it. */
  brandName?: string | null
  /**
   * Override the one sentence that tells Vera WHAT KIND of thing this is. The default framing comes
   * from `kind` and is commerce-shaped ("a physical product for sale"), which is wrong on the peer
   * board: a Classifieds listing takes no payment, and half of them are a giveaway, a loan, or a
   * request (docs/NAMING.md). A caller that is not selling passes its own true sentence instead.
   */
  framing?: string | null
  /** The actor + Space, for the usage ledger + the per-Space daily cap (never blocks). */
  profileId?: string | null
  spaceId?: string | null
}

/** The draft Vera returns: a short title and a short description, both member-facing. */
export interface ListingCopy {
  title: string
  description: string
  questions?: string[]
}


/** Legacy parser refuses authored fields; retained for callers migrating to coaching. */
export function parseCopy(raw: string): ListingCopy | null { const questions = parseWritingQuestions(raw); return questions ? { title: '', description: '', questions } : null }
export async function draftListingCopy(input: ListingCopyInput): Promise<ListingCopy> {
 return { title: '', description: '', questions: await writingCoach({ feature: 'listing-copy', context: JSON.stringify({ kind: input.kind, seed: input.seed, priceModel: input.priceModel, framing: input.framing }), profileId: input.profileId, spaceId: input.spaceId }) }
}

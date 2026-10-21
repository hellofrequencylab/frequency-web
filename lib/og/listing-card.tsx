import { stageCardResponse } from '@/lib/og/stage-card'
import { SITE_NAME } from '@/lib/site'

// The share card for a marketplace listing (Market, Classifieds, Housing, the Store): the shared
// Stage layout with the listing's own photo behind the title, its price as the chip, and its category
// and coarse place on the facts row. Each route reads the SAME record its page renders and hands in
// plain strings; this module reads nothing, so it can never widen what the page already shows.
//
// Privacy: a listing the page would 404 (sold, closed, draft, removed) arrives as null and gets a card
// that publishes no listing words at all, so a stale link reveals nothing through its image.

type ListingCardInput = {
  title: string
  /** The short price for the chip ("$299", "Free"), or null when the listing states none. */
  price: string | null
  /** Category and coarse place, joined onto the facts row. Never a street address. */
  facts: Array<string | null | undefined>
  blurb: string | null
  image: string | null
}

/** `noun` is the kicker and the neutral line: "Market", "Classifieds", "Housing", "Store". */
export async function listingCardResponse(noun: string, input: ListingCardInput | null): Promise<Response> {
  if (!input) {
    return stageCardResponse({ kicker: noun, title: `A listing on ${SITE_NAME}`, line: 'A community marketplace' })
  }
  return stageCardResponse({
    kicker: noun,
    title: input.title,
    chip: input.price,
    meta: input.facts.filter(Boolean).join(' · ') || null,
    line: input.blurb?.replace(/\s+/g, ' ').trim() || `Listed on ${SITE_NAME}`,
    coverUrl: input.image,
  })
}

// WHAT ONE SENTENCE SAYS A BUSINESS DOES. The Create a Space builder asks "What does your business offer?" and
// mocks up the site from the answer with no model: a keyword table maps the sentence to the wizard's own goals
// (WIZARD_INTENTS), and lib/create-space/preview-site.ts already turns goals into the eyebrow, the italic line, the
// button and the three offer cards. The mock-up is never presented as AI; it is a mock-up built from their words.
// PURE and client-safe, so it runs signed out and a probe can run it under node.
//
// The table is the v3 handoff's starting list (README section 3, step 2). It is reviewed against real offer
// sentences once the lead data comes in (README section 11), so a keyword here is a guess that gets replaced by
// evidence, not a rule.

import { WIZARD_INTENTS } from '@/lib/spaces/create-wizard'

type IntentId = (typeof WIZARD_INTENTS)[number]['id']

/** What a sentence can say, in the catalog's order, so two matches always come back in the same order. */
const OFFER_WORDS: readonly [IntentId, RegExp][] = [
  ['bookings', /\b(book|session|appoint|1:1|one.on.one|coach|therap|consult|massage|heal|design|client|lesson|tutor)/i],
  ['classes', /\b(class|studio|member|gym|pilates|dance|fitness|weekly)/i],
  ['programs', /\b(course|program|teach|cohort|training|school)/i],
  ['events', /\b(event|workshop|gathering|night|retreat|ticket|supper|party|concert|festival)/i],
  ['products', /\b(sell|shop|product|handmade|ceramic|goods|store|bake|print)/i],
  ['community', /\b(community|circle|group|club|meetup|neighbo)/i],
  ['donations', /\b(nonprofit|non-profit|donat|charity|fundrais|volunteer)/i],
]

/** The goals the preview falls back to when a sentence names none: the same three the empty preview shows. */
export const OFFER_FALLBACK: readonly IntentId[] = ['events', 'bookings', 'community']

/** The sentence's length cap, shared with the builder's textarea. */
export const OFFER_MAX = 160

/** Up to three goals a sentence names, in catalog order; the fallback three when it names none. Total. */
export function intentsFromOffer(sentence: string): IntentId[] {
  const text = sentence.slice(0, OFFER_MAX)
  const found = OFFER_WORDS.filter(([, rx]) => rx.test(text)).map(([id]) => id)
  return (found.length ? found : [...OFFER_FALLBACK]).slice(0, 3)
}

/** Whether the sentence reads as a venue or a place that hosts others rather than a practitioner. Used to pick the
 *  lead's persona (partner, not practitioner) when the draft is saved. Total. */
export function offerReadsAsVenue(sentence: string): boolean {
  return /\b(venue|hall|space for hire|rent(al)? space|host(s|ing)? (events|groups|classes)|bar|cafe|café|restaurant|gallery|theat(re|er))\b/i.test(sentence)
}

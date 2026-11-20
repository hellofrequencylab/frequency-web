// When a Spotlight page has too little on it to be worth a search result (SCAN-1277).
//
// The 2026-11-19 production crawl found published Spotlights in the sitemap with almost nothing on
// them: /spaces/awesome-possum/spotlight at 14 words, /spotlight/aidentyack at 17. A link page with
// a name and a few buttons tells a search engine nothing, and a site with many of them reads as thin.
// The page still opens for everyone who has the link (its whole job); it just says noindex, follow
// and stays out of the sitemap until the owner writes something about themselves.
//
// The text measured is the one a reader actually gets: a member's bio, a Space's About. PURE, so the
// sitemap readers and the pages share one rule.

/** The fewest words of About text an indexable Spotlight carries. One real sentence or two. */
export const SPOTLIGHT_MIN_WORDS = 12

/** Words in a piece of free text. */
export function wordCount(text: string | null | undefined): number {
  return (text ?? '').trim().split(/\s+/).filter(Boolean).length
}

/** True when a Spotlight's About text is too short for the page to be indexed. */
export function isThinSpotlightText(text: string | null | undefined): boolean {
  return wordCount(text) < SPOTLIGHT_MIN_WORDS
}

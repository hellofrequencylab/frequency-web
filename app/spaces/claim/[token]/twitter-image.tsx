// X/Twitter share card for a Space CLAIM link — the SAME card as the OG image (one source,
// re-exported, the site-root pattern used by app/(main)/spaces/[slug]/twitter-image.tsx).
//
// WHY THIS FILE EXISTS. Next only replaces `twitter.images` when the CURRENT segment ships a
// twitter-image file; otherwise the value from the ROOT segment survives. Without this, the claim
// link's Twitter card was the generic Frequency hero while its OG card was the business's own — two
// different previews of the same URL depending on which tag the client preferred.
export { default, alt, size, contentType } from './opengraph-image'

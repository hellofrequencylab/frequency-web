// The article's twitter:image. Mirrors `app/(help)/twitter-image.tsx`, which does the same for the
// group card.
//
// 🔴 THIS IS NOT OPTIONAL, and skipping it would have half-fixed LIVE-183. Next merges the
// file-convention images per segment and the deeper one wins PER KIND: `mergeStaticMetadata` in
// next/dist/lib/metadata/resolve-metadata.js only overwrites `target.twitter` when the segment
// being merged declares a twitter file of its own. With an opengraph-image here and no
// twitter-image, the article's og:image would be its own card while twitter:image kept resolving to
// the group card from `app/(help)` — X and Slack would still show the same picture for all 57.
// (The postProcessMetadata fallback from openGraph to twitter does not rescue it either: it only
// fires when nothing has set twitter images, and the group card has.)
export const runtime = 'nodejs'
export { default, alt, size, contentType } from './opengraph-image'

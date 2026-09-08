import type { Metadata } from 'next'

// The ONE metadata object every `not-found.tsx` exports (LIVE-214, ADR-1276).
//
// WHY IT EXISTS. A not-found page renders inside the root layout, so it inherits the root's
// `robots: { index: true, follow: true }` default, and Next ALSO injects its own
// `<meta name="robots" content="noindex" />` for every 404 response (app-render's NonIndex for a
// route-level 404; the server-inserted-HTML path for a `notFound()` thrown mid-stream). Measured
// on production 2026-09-08: a dead path answered 404 with BOTH tags in the head. Crawlers resolve
// the pair to the most restrictive, so it never indexed, but a head that says two things is a head
// nobody can read at a glance, and it was the literal second sentence of LIVE-208.
//
// WHY `robots: null` AND NOT `{ index: false }`. `robots` is a NESTED metadata field, so a segment
// that defines it OVERWRITES the root default wholesale (generate-metadata docs, "Merging"). `null`
// overwrites it with NOTHING: the Metadata API emits no robots tag at all on this path, and the
// head carries exactly one directive, the framework's own `noindex`, which cannot be removed and
// is the correct one. `{ index: false }` would have replaced the contradiction with a duplicate
// (two `noindex` tags). The 404 status is the primary signal either way; this only stops the
// metadata layer from contradicting it.
//
// HOW IT REACHES THE HEAD. This Next version collects metadata from the `not-found` module of
// every segment on the error path (lib/metadata/resolve-metadata: `collectMetadata` reads
// `getComponentTypeModule(tree, 'not-found')` when the error convention is set) and places the
// deepest one LAST, after every layout. So each `not-found.tsx` must export it, not only the root
// one: a nested `notFound()` renders the nearest not-found file, and that file's metadata is the
// one that wins. `scripts/check-seo.mjs` (Scan F) fails a not-found file that does not.
export const NOT_FOUND_METADATA: Metadata = {
  title: 'Page not found',
  robots: null,
}

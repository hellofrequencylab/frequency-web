// PUBLIC DETAIL PAGES that live inside the (main) route group but are advertised in app/sitemap.ts.
//
// app/(main)/layout.tsx redirects an anonymous visitor to `/` for any path it does not recognise as
// public. That rule and the sitemap are written in different files for different reasons, and they
// drifted: the sitemap advertised /store/<id>, /market/<id>, /housing/<id>,
// /classifieds/<id> and /spaces/<slug>/podcasts/<showSlug> — each emitting its own canonical and
// JSON-LD — while the layout answered every one with a 307 to the homepage. We were submitting URLs
// and then bouncing the crawler off them. robots.ts even documents /store/<id> as "self-canonical +
// indexable (Product schema)", which it could not have been.
//
// Making these public is safe because it only lets each page's OWN gate run. An anon viewer resolves
// to a null profile id, so a draft, unpublished, or private row still notFound()s — the visibility
// rules were always written for a signed-out reader, they were just never reached.
//
// PURE (no server imports) so the layout and the drift guard can both read the same list.

/** The route families a signed-out visitor may view inside (main). DETAIL routes only: the index
 *  pages (/store, /market) stay members-only and carry their own noindex, and any deeper sub-route
 *  (/manage, /edit) must never match. */
export const PUBLIC_DETAIL_PATTERNS: readonly RegExp[] = [
  /^\/store\/[^/]+$/, // Frequency Store product (Product JSON-LD)
  /^\/market\/[^/]+$/, // Global Market listing (Product JSON-LD)
  /^\/housing\/[^/]+$/, // Housing listing
  /^\/classifieds\/[^/]+$/, // Classified listing
  // A Show page. NOT covered by the layout's isAnonSpaceProfile: that regex allows at most ONE
  // segment after the slug and this is two. The Shows INDEX (/spaces/<slug>/podcasts) does match it
  // and was already public.
  /^\/spaces\/[^/]+\/podcasts\/[^/]+$/,
]

/** Whether a path is one of the sitemap-advertised public detail pages. */
export function isAnonPublicDetail(p: string | null): boolean {
  if (!p) return false
  return PUBLIC_DETAIL_PATTERNS.some((re) => re.test(p))
}

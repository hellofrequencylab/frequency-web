import { notFound } from 'next/navigation'

// The `(main)` group's EXPLICIT not-found route (LIVE-208, ADR-1267).
//
// ── WHY A PAGE HAS TO EXIST HERE AT ALL ──────────────────────────────────────────────────────
//
// `@wizard/[...catchAll]/page.tsx` beside this file is the Spark modal's closer (ADR-1017). It is
// a PARALLEL-ROUTE SLOT page, and the compiler HOISTS IT OUT OF THE SLOT into a real top-level
// route — proven from the artifact, not argued:
//
//     .next/routes-manifest.json        /[...catchAll]   regex  ^/(.+?)(?:/)?$
//     .next/app-path-routes-manifest    "/(main)/@wizard/[...catchAll]/page" => "/[...catchAll]"
//
// That regex matches every URL on the domain, so EVERY unmatched path matched something and
// nothing 404ed: an unmatched path resolved through the member tree and answered `307 Location: /`
// (the signed-out redirect in ../layout.tsx), which is a soft-404 signal to a crawler and a dead
// shared link that lands on the front door without saying so.
//
// ── WHY THE SLOT PAGE CANNOT BE THE ONE TO CALL notFound() ───────────────────────────────────
//
// 🔴 MEASURED, because the obvious fix is wrong. The slot's catch-all renders on EVERY route in
// this layout, not only on unmatched ones — instrumented on a running build, it logged for
// `/events`, `/spaces/[slug]` and `/market/[id]` alike. That is its whole job: it renders null so
// the modal closes on the next navigation. A `notFound()` in there would fire on every member page
// in the product. The page that renders ONLY when no real route matched is this one, the least
// specific page in the `children` slot, so this is where the not-found belongs.
//
// ── WHY `dynamicParams` + AN EMPTY `generateStaticParams`, AND NOT JUST notFound() ───────────
//
// 🔴 ALSO MEASURED. A `notFound()` in a page cannot beat a `redirect()` in a layout above it:
// `../layout.tsx` throws its signed-out redirect from its own body, before React ever renders the
// page, so a bare `notFound()` here still answered 307 for exactly the visitor an SEO defect is
// about — an anonymous one. Declaring the params CLOSED moves the answer up to the router: an
// empty param set with `dynamicParams = false` means no URL can resolve to this segment, so Next
// answers 404 at ROUTING time and the layout never runs. Read on a real build served locally:
// `/this-path-does-not-exist` went 307 → **404**, with the not-found body and Next's `noindex`,
// while `/`, `/events`, `/help` and the `/circles` → `/sign-in` redirect were all unchanged.
//
// The `notFound()` below is therefore not dead code and must not be deleted: it is the statement
// of intent that `pnpm check:notfound-routes` reads out of this file after every build, and it is
// what serves if the segment config above is ever loosened.

export const dynamicParams = false

export function generateStaticParams(): { catchAll: string[] }[] {
  return []
}

export default function MainCatchAll() {
  notFound()
}

// The `@wizard` slot's closer (ADR-1017).
//
// A slot keeps showing its last active subpage across client-side navigations that do not match it,
// so without this a member who opened a Spark modal and then followed a link INSIDE it (the Spark's
// own "Go to Classifieds" escape hatch, say) would carry the modal onto the next page. The parallel
// routes doc names the fix in so many words: "we need to match the slot to a route that returns
// null to close the modal", via a catch-all
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/parallel-routes.md,
// §Modals → Closing the modal).
//
// The intercepting routes beside this one are more specific, so they still win on their own URLs.
//
// ⚠️ IT RENDERS ON EVERY ROUTE IN THIS LAYOUT, NOT ONLY ON UNMATCHED ONES, and that is not a
// detail — it is why the not-found handling for an unmatched URL lives in a DIFFERENT file
// (LIVE-208, ADR-1267). Instrumented on a running build, this page logged for `/events`,
// `/spaces/[slug]` and `/market/[id]` alike, because closing the modal is exactly "render null
// everywhere the modal is not". So it must keep returning null: a `notFound()` here would fire on
// every member page in the product.
//
// The compiler also HOISTS this page out of the slot into a real top-level route
// (`/[...catchAll]`, regex `^/(.+?)(?:/)?$` in `.next/routes-manifest.json`), which is how an
// unmatched URL came to resolve through the member tree instead of 404ing. The children page that
// answers that route is `app/(main)/[...catchAll]/page.tsx` — read it before touching this file,
// and do not delete either one without the other. `pnpm check:notfound-routes` fails a build where
// this slot page is the ONLY owner of a route that matches an arbitrary URL.
export default function WizardSlotCatchAll() {
  return null
}

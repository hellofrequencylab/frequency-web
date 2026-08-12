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
export default function WizardSlotCatchAll() {
  return null
}

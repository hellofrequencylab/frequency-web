// The `@wizard` slot's fallback (ADR-1010).
//
// Parallel-route slots keep their own active state, and on a HARD navigation Next cannot recover
// the state of a slot the URL does not name — it renders this file, or 404s if it is missing
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/parallel-routes.md,
// §`default.js`). Returning null is what makes a cold hit on a wizard URL render the wizard's own
// full page rather than the modal: interception is a client-navigation mechanism, so on a refresh,
// a shared link, or a crawl the slot has nothing to show and the `children` slot renders the real
// page. That is the ADR-986 half of this feature, and this three-line file is where it lives.
export default function WizardSlotDefault() {
  return null
}

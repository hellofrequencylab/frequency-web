// Routes whose page content is operator-editable from the page Settings panel
// (ADR-180): the header title + description — which also drive the route's SEO
// metadata via `pageContentMetadata` in its `generateMetadata` — plus an optional
// hero image and call-to-action (PX.1). Putting a route here makes its PageHeading
// editable by an admin+ from the Settings dropdown; the page itself must read
// `resolvePageContent(route, fallback)` (lib/page-content) for the edits to take
// effect — editing is purely additive, with the coded copy as the fallback. The
// hero/CTA render only where the page's template has a natural slot for them.
//
// This is the single registry for the site-wide content sweep: add a route here AND
// wire its page to resolvePageContent (+ pageContentMetadata), and the page becomes
// editable in place.
export const CONTENT_EDIT_ROUTES = [
  '/network',
  '/circles',
  '/channels',
  '/events',
  '/market',
  '/messages',
  '/journeys',
  '/practices',
  '/library',
  '/broadcast',
] as const

export type ContentEditRoute = (typeof CONTENT_EDIT_ROUTES)[number]

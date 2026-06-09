// Routes whose page header (title + description) is operator-editable from the page
// Settings panel (ADR-180). Putting a route here makes its PageHeading editable by
// an admin+ from the Settings dropdown; the page itself must read
// `resolvePageContent(route, fallback)` (lib/page-content) for the edits to take
// effect — editing is purely additive, with the coded copy as the fallback.
//
// This is the single registry for the site-wide content sweep: add a route here AND
// wire its page to resolvePageContent, and the page becomes editable in place.
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

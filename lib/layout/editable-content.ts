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
  // Home: SEO title + meta description ONLY (edited from /pages/home). The page
  // itself is a coded experience (live counts, parallax) and stays in code — it
  // reads resolvePageContent('/') in generateMetadata, nothing else.
  '/',
  '/network',
  '/circles',
  '/channels',
  '/events',
  '/classifieds',
  '/messages',
  '/journeys',
  '/practices',
  '/library',
  // Renamed from '/broadcast' with the route (ADR-1020). `page_content` is keyed by the
  // ROUTE STRING, so this registry line, the page's resolvePageContent call, and its
  // pageContentMetadata call all had to move together or the operator's edits would write
  // to one key and the page would read another. NO data migration was run: the production
  // row for '/broadcast' was measured empty (title NULL, description NULL) on 2026-08-12,
  // so there was nothing to carry over. That row is now inert — nothing reads it — and
  // deleting it is a data change for the owner to make, not a code change.
  '/nearby',
  // Admin Menu Manager: the page Settings is trimmed to Subtitle + Layout (ADR-359). The
  // Subtitle editor edits only this route's description (the header subtitle); the page reads
  // it via resolvePageContent('/admin/menu', fallback), with the coded line as the fallback.
  '/admin/menu',
] as const
